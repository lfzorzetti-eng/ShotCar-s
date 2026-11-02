// Puxa FIPE, vPIC e Wikidata uma vez, normaliza e faz upsert em marcas e modelos.
// Uso: npm run catalogo:importar [-- --sem-fipe --sem-vpic --sem-wikidata]
import { readFile, writeFile } from 'node:fs/promises';
import { conectar, fechar } from '../src/db.mjs';
import { normalizar, resolverMarca, slugify, tituloDe } from '../src/normalizar.mjs';

const args = new Set(process.argv.slice(2));
const curadoria = JSON.parse(await readFile(new URL('../curadoria.json', import.meta.url), 'utf8'));
const MARCAS = curadoria.marcas; // só as marcas do MVP

// Nomes conhecidos por marca (da curadoria), do mais longo ao mais curto, para cortar versões da FIPE.
const conhecidos = {};
for (const [marca, { album }] of Object.entries(MARCAS)) {
  const nomes = album.flatMap((e) => [{ n: normalizar(e.nome), nome: e.nome }, ...(e.aliases ?? []).map((a) => ({ n: normalizar(a), nome: e.nome }))]);
  conhecidos[marca] = nomes.sort((a, b) => b.n.length - a.n.length);
}

const modelos = new Map(); // slug → acumulado de todas as fontes

function acrescentar(marcaBruta, nomeBruto, fonte, { cortarVersao = false, anoInicio, anoFim } = {}) {
  const { marca, prefixo, original } = resolverMarca(marcaBruta);
  if (!MARCAS[marca]) return;

  let n = normalizar(nomeBruto);
  for (const p of [original, normalizar(MARCAS[marca].nome)]) if (n.startsWith(`${p} `)) n = n.slice(p.length + 1);
  if (prefixo && !n.startsWith(`${prefixo} `)) n = `${prefixo} ${n}`;
  if (!n) return;

  const alias = n;
  const conhecido = conhecidos[marca].find((k) => n === k.n || n.startsWith(`${k.n} `));
  let nome;
  if (conhecido) {
    n = normalizar(conhecido.nome);
    nome = conhecido.nome;
  } else if (cortarVersao) {
    // "Gol 1.0 Mi Total Flex" → "gol", "Agile LTZ EASYTRONIC" → "agile": a FIPE escreve o motor
    // com número e o acabamento em maiúsculas; corta no primeiro dos dois.
    const partes = String(nomeBruto).trim().split(/\s+/);
    const corte = partes.findIndex((p, i) => i > 0 && (/^\d/.test(p) || (/^[A-Z0-9.\-/+]+$/.test(p) && /[A-Z]/.test(p))));
    n = normalizar(partes.slice(0, corte > 0 ? corte : undefined).join(' '));
    for (const p of [original, normalizar(MARCAS[marca].nome)]) if (n.startsWith(`${p} `)) n = n.slice(p.length + 1);
    if (prefixo && !n.startsWith(`${prefixo} `)) n = `${prefixo} ${n}`;
    nome = tituloDe(n);
  } else {
    nome = String(nomeBruto).trim();
  }

  const slug = `${marca}-${slugify(n)}`;
  const m = modelos.get(slug) ?? { slug, marca, nome, aliases: new Set(), fontes: new Set() };
  m.aliases.add(alias);
  m.fontes.add(fonte);
  if (anoInicio) m.anoInicio = Math.min(m.anoInicio ?? Infinity, anoInicio);
  if (anoFim) m.anoFim = Math.max(m.anoFim ?? -Infinity, anoFim);
  modelos.set(slug, m);
}

async function getJson(url, opcoes = {}) {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(60_000) });
    if (r.ok) return r.json();
    if (tentativa >= 3 || (r.status < 500 && r.status !== 429)) throw new Error(`${r.status} em ${url}`);
    await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
  }
}

// FIPE: 1 requisição de marcas + 1 por marca do MVP (limite: 500/dia sem token).
async function fipe() {
  const base = 'https://fipe.parallelum.com.br/api/v2/cars';
  const headers = process.env.FIPE_TOKEN ? { 'X-Subscription-Token': process.env.FIPE_TOKEN } : {};
  const marcas = await getJson(`${base}/brands`, { headers });
  for (const marca of marcas) {
    if (!MARCAS[resolverMarca(marca.name).marca]) continue;
    const lista = await getJson(`${base}/brands/${marca.code}/models`, { headers });
    for (const modelo of lista) acrescentar(marca.name, modelo.name, 'fipe', { cortarVersao: true });
  }
}

// Só carros, picapes e SUVs: sem o filtro de tipo o vPIC traz motos (Honda) e caminhões.
async function vpic() {
  for (const { nome } of Object.values(MARCAS)) {
    for (const tipo of ['car', 'truck', 'mpv']) {
      const { Results } = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(nome)}/vehicletype/${tipo}?format=json`);
      for (const r of Results) acrescentar(nome, r.Model_Name, 'vpic');
    }
  }
}

async function wikidata() {
  const nomes = Object.values(MARCAS).map((m) => `"${m.nome}"@en`).join(' ');
  const sparql = `
    SELECT ?nomeMarca ?nomeModelo (MIN(YEAR(?ini)) AS ?anoIni) (MAX(YEAR(?fim)) AS ?anoFim) WHERE {
      VALUES ?nomeMarca { ${nomes} }
      ?marca rdfs:label ?nomeMarca .
      ?modelo wdt:P31 wd:Q3231690 ; (wdt:P1716|wdt:P176) ?marca ; rdfs:label ?nomeModelo .
      FILTER(LANG(?nomeModelo) = "en")
      OPTIONAL { ?modelo wdt:P2031|wdt:P571 ?ini }
      OPTIONAL { ?modelo wdt:P2032 ?fim }
    } GROUP BY ?nomeMarca ?nomeModelo`;
  const { results } = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, {
    headers: { 'user-agent': 'CarDex/0.1 (catalogo de carros; script de importacao)', accept: 'application/sparql-results+json' },
  });
  for (const b of results.bindings) {
    acrescentar(b.nomeMarca.value, b.nomeModelo.value, 'wikidata', {
      anoInicio: b.anoIni ? Number(b.anoIni.value) : undefined,
      anoFim: b.anoFim ? Number(b.anoFim.value) : undefined,
    });
  }
}

const fontes = { fipe, vpic, wikidata };
for (const [nome, puxar] of Object.entries(fontes)) {
  if (args.has(`--sem-${nome}`)) continue;
  const antes = modelos.size;
  try {
    await puxar();
    console.log(`✓ ${nome}: ${modelos.size - antes} modelos novos (total ${modelos.size})`);
  } catch (erro) {
    console.warn(`⚠ ${nome} falhou, seguindo sem ela: ${erro.message}`);
  }
}

const db = await conectar();
for (const [slug, { nome }] of Object.entries(MARCAS)) {
  await db.collection('marcas').updateOne({ slug }, { $set: { slug, nome } }, { upsert: true });
}

// Cada fonte só acrescenta fontes, aliases e amplia a faixa de anos; curadoria e raridade não são tocadas.
const ops = [...modelos.values()].map((m) => ({
  updateOne: {
    filter: { slug: m.slug },
    update: {
      $setOnInsert: { slug: m.slug, marca: m.marca, nome: m.nome, geracoes: [], noAlbum: false, ordemAlbum: null, raridade: null, revisado: false },
      $addToSet: { fontes: { $each: [...m.fontes] }, aliases: { $each: [...m.aliases] } },
      ...(m.anoInicio && { $min: { anoInicio: m.anoInicio } }),
      ...(m.anoFim && { $max: { anoFim: m.anoFim } }),
    },
    upsert: true,
  },
}));
if (ops.length) {
  const r = await db.collection('modelos').bulkWrite(ops, { ordered: false });
  console.log(`Mongo: ${r.upsertedCount} inseridos, ${r.modifiedCount} atualizados`);
}

// Revisão manual: modelos de uma fonte só e candidatos a duplicata ("onix hatch" ao lado de "onix").
const todos = await db.collection('modelos').find({ marca: { $in: Object.keys(MARCAS) } }).sort({ slug: 1 }).toArray();
const linhas = ['# Revisão do catálogo', ''];
for (const marca of Object.keys(MARCAS)) {
  const daMarca = todos.filter((m) => m.marca === marca);
  const duplicatas = [];
  for (const a of daMarca) for (const b of daMarca) if (a !== b && b.slug.startsWith(`${a.slug}-`)) duplicatas.push(`${b.slug}  →  talvez ${a.slug}`);
  const umaFonte = daMarca.filter((m) => (m.fontes ?? []).length <= 1).map((m) => `${m.slug}  (${(m.fontes ?? []).join(', ') || 'manual'})`);
  linhas.push(`## ${marca} — ${daMarca.length} modelos`, '', '### Candidatos a duplicata', ...(duplicatas.length ? duplicatas : ['(nenhum)']), '', '### Só uma fonte', ...umaFonte, '');
}
await writeFile(new URL('../revisao-catalogo.md', import.meta.url), linhas.join('\n'));
console.log('Relatório de revisão em revisao-catalogo.md');

await fechar();
