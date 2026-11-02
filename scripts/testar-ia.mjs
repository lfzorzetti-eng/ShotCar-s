// Teste das ~50 fotos: mede a taxa de acerto do reconhecedor configurado.
// Uso: npm run ia:testar -- <pasta>
// Cada arquivo se chama pelo slug esperado: porsche-911.jpg, porsche-911-2.jpg, volkswagen-gol.png…
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { conectar, fechar } from '../src/db.mjs';
import { criarReconhecedor } from '../src/reconhecimento/index.mjs';

const pasta = process.argv[2];
if (!pasta) {
  console.error('Uso: npm run ia:testar -- <pasta-com-fotos>');
  process.exit(1);
}

const db = await conectar();
const catalogo = await db.collection('modelos').find({}, { projection: { slug: 1, marca: 1, nome: 1 } }).toArray();
await fechar();
const slugs = new Set(catalogo.map((m) => m.slug));
const reconhecedor = criarReconhecedor();

const fotos = (await readdir(pasta)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
let acertosModelo = 0;
let acertosMarca = 0;
let testadas = 0;

console.log(`Reconhecedor: ${reconhecedor.nome} · catálogo: ${catalogo.length} modelos\n`);
for (const arquivo of fotos) {
  const esperado = path.parse(arquivo).name.replace(/-\d+$/, '');
  if (!slugs.has(esperado)) {
    console.log(`  pulei ${arquivo}: "${esperado}" não está no catálogo`);
    continue;
  }
  testadas++;
  try {
    const r = await reconhecedor.identify({ foto: await readFile(path.join(pasta, arquivo)), catalogo });
    const marcaOk = r.slug.split('-')[0] === esperado.split('-')[0];
    acertosModelo += r.slug === esperado;
    acertosMarca += marcaOk;
    const sinal = r.slug === esperado ? '✓' : marcaOk ? '~' : '✗';
    console.log(`${sinal} ${arquivo.padEnd(32)} → ${r.slug} (${r.confianca.toFixed(2)})`);
  } catch (erro) {
    console.log(`! ${arquivo.padEnd(32)} → erro: ${erro.message}`);
  }
}

if (testadas) {
  const pct = (n) => `${((100 * n) / testadas).toFixed(0)}%`;
  console.log(`\n${testadas} fotos · modelo certo: ${acertosModelo} (${pct(acertosModelo)}) · marca certa: ${acertosMarca} (${pct(acertosMarca)})`);
}
