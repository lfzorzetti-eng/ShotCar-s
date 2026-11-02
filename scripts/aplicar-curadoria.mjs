// Grava curadoria.json no Mongo (espaços do álbum, ordem e raridade) e lista slugs que não existem.
// Uso: npm run catalogo:curadoria [-- --criar-faltantes]
import { readFile } from 'node:fs/promises';
import { conectar, fechar } from '../src/db.mjs';
import { RARIDADES } from '../src/album.mjs';
import { normalizar } from '../src/normalizar.mjs';

const criarFaltantes = process.argv.includes('--criar-faltantes');
const curadoria = JSON.parse(await readFile(new URL('../curadoria.json', import.meta.url), 'utf8'));

const db = await conectar();
const modelos = db.collection('modelos');
const faltantes = [];

const checarRaridade = (slug, r) => {
  if (!RARIDADES.includes(r)) throw new Error(`Raridade inválida em ${slug}: ${r}`);
};

// Tirar um carro da curadoria tira o espaço do álbum, mas não apaga a raridade dele.
await modelos.updateMany({ noAlbum: true }, { $set: { noAlbum: false, ordemAlbum: null } });

for (const [marca, { nome, album }] of Object.entries(curadoria.marcas)) {
  await db.collection('marcas').updateOne({ slug: marca }, { $set: { slug: marca, nome } }, { upsert: true });

  for (const [ordem, espaco] of album.entries()) {
    checarRaridade(espaco.slug, espaco.raridade);
    const aliases = [normalizar(espaco.nome), ...(espaco.aliases ?? []).map(normalizar)];
    const existe = await modelos.findOne({ slug: espaco.slug });
    if (!existe && !criarFaltantes) {
      faltantes.push(espaco.slug);
      continue;
    }
    // Clássicos (SP2, 356) podem não vir de nenhuma fonte: com --criar-faltantes eles entram como "manual".
    await modelos.updateOne(
      { slug: espaco.slug },
      {
        $set: { nome: espaco.nome, noAlbum: true, ordemAlbum: ordem, raridade: espaco.raridade, revisado: true },
        $setOnInsert: { slug: espaco.slug, marca, geracoes: [] },
        $addToSet: { aliases: { $each: aliases }, ...(!existe && { fontes: 'manual' }) },
      },
      { upsert: true },
    );
  }
}

for (const [slug, raridade] of Object.entries(curadoria.extras ?? {})) {
  checarRaridade(slug, raridade);
  const r = await modelos.updateOne({ slug }, { $set: { raridade } });
  if (!r.matchedCount) faltantes.push(`${slug} (extra)`);
}

const total = await modelos.countDocuments({ noAlbum: true });
console.log(`✓ ${total} espaços de álbum gravados em ${Object.keys(curadoria.marcas).length} marcas`);
if (faltantes.length) {
  console.warn(`⚠ ${faltantes.length} slugs da curadoria não existem no catálogo:`);
  for (const s of faltantes) console.warn(`  - ${s}`);
  console.warn('Corrija o slug em curadoria.json, rode o import de novo, ou use --criar-faltantes.');
}

await fechar();
