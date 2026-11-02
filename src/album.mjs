export const RARIDADES = ['comum', 'incomum', 'raro', 'epico', 'lendario'];

// Primeira foto e número de vezes de cada modelo que o usuário capturou (só capturas confirmadas).
async function capturasDoUsuario(db, usuarioId, marca) {
  const pipeline = [
    { $match: { usuarioId, status: 'confirmada' } },
    { $sort: { criadoEm: 1 } },
    { $group: { _id: '$modeloId', primeira: { $first: '$$ROOT' }, vezes: { $sum: 1 } } },
    { $lookup: { from: 'modelos', localField: '_id', foreignField: '_id', as: 'modelo' } },
    { $unwind: '$modelo' },
  ];
  if (marca) pipeline.push({ $match: { 'modelo.marca': marca } });
  return db.collection('capturas').aggregate(pipeline).toArray();
}

function cartao(modelo, captura) {
  return {
    slug: modelo.slug,
    nome: modelo.nome,
    raridade: modelo.raridade ?? null,
    capturado: Boolean(captura),
    vezes: captura?.vezes ?? 0,
    fotoUrl: captura?.primeira.fotoUrl ?? null,
    geracao: captura?.primeira.geracao ?? null,
    primeiraEm: captura?.primeira.criadoEm ?? null,
  };
}

export async function montarAlbum(db, usuarioId, marca) {
  const marcaDoc = await db.collection('marcas').findOne({ slug: marca });
  if (!marcaDoc) return null;

  const [espacosDocs, capturas] = await Promise.all([
    db.collection('modelos').find({ marca, noAlbum: true }).sort({ ordemAlbum: 1 }).toArray(),
    capturasDoUsuario(db, usuarioId, marca),
  ]);
  const porModelo = new Map(capturas.map((c) => [String(c._id), c]));

  const espacos = espacosDocs.map((m) => cartao(m, porModelo.get(String(m._id))));

  // Fora da curadoria vai para a Garagem: não conta no progresso, mas mostra a raridade se já avaliada.
  const garagem = capturas
    .filter((c) => !c.modelo.noAlbum)
    .map((c) => cartao(c.modelo, c))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const porRaridade = {};
  for (const r of RARIDADES) {
    const doNivel = espacos.filter((e) => e.raridade === r);
    if (doNivel.length) porRaridade[r] = { capturados: doNivel.filter((e) => e.capturado).length, total: doNivel.length };
  }

  return {
    marca: { slug: marcaDoc.slug, nome: marcaDoc.nome },
    progresso: { capturados: espacos.filter((e) => e.capturado).length, total: espacos.length },
    porRaridade,
    espacos,
    garagem,
  };
}

export async function listarAlbuns(db, usuarioId) {
  const [marcas, totais, capturas] = await Promise.all([
    db.collection('marcas').find().sort({ nome: 1 }).toArray(),
    db.collection('modelos').aggregate([{ $match: { noAlbum: true } }, { $group: { _id: '$marca', total: { $sum: 1 } } }]).toArray(),
    capturasDoUsuario(db, usuarioId),
  ]);
  const totalPorMarca = new Map(totais.map((t) => [t._id, t.total]));

  return marcas
    .filter((m) => totalPorMarca.has(m.slug))
    .map((m) => {
      const daMarca = capturas.filter((c) => c.modelo.marca === m.slug);
      return {
        slug: m.slug,
        nome: m.nome,
        progresso: { capturados: daMarca.filter((c) => c.modelo.noAlbum).length, total: totalPorMarca.get(m.slug) },
        garagem: daMarca.filter((c) => !c.modelo.noAlbum).length,
      };
    });
}
