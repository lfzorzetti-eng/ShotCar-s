import { MongoClient } from 'mongodb';

let client;

export async function conectar() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não definida. Copie .env.example para .env e cole a connection string do Atlas.');
  client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'cardex');
  await criarIndices(db);
  return db;
}

export async function fechar() {
  await client?.close();
}

// O Mongo não impõe chaves estrangeiras: a integridade do catálogo depende do índice único em modelos.slug.
async function criarIndices(db) {
  await db.collection('marcas').createIndex({ slug: 1 }, { unique: true });
  const modelos = db.collection('modelos');
  await modelos.createIndex({ slug: 1 }, { unique: true });
  await modelos.createIndex({ marca: 1 });
  await modelos.createIndex({ marca: 1, noAlbum: 1, ordemAlbum: 1 });
  await modelos.createIndex({ raridade: 1 });
  await db.collection('usuarios').createIndex({ email: 1 }, { unique: true });
  await db.collection('capturas').createIndex({ usuarioId: 1, modeloId: 1 });
}
