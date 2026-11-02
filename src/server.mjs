import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { conectar } from './db.mjs';
import { listarAlbuns, montarAlbum } from './album.mjs';
import { criarReconhecedor } from './reconhecimento/index.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_FOTOS = path.join(RAIZ, 'uploads');
const PASTA_WEB = path.join(RAIZ, 'web', 'dist');
const CONFIANCA_MINIMA = 0.6;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET não definida (veja .env.example)');

const db = await conectar();
const reconhecedor = criarReconhecedor();
await mkdir(PASTA_FOTOS, { recursive: true });

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
await app.register(fastifyStatic, { root: PASTA_FOTOS, prefix: '/fotos/', decorateReply: false });
if (existsSync(PASTA_WEB)) await app.register(fastifyStatic, { root: PASTA_WEB, prefix: '/' });

// Catálogo em memória por 1 minuto: vai junto no prompt a cada foto, não precisa ir ao banco toda vez.
let catalogoCache = { em: 0, modelos: [] };
async function catalogo() {
  if (Date.now() - catalogoCache.em > 60_000) {
    const modelos = await db.collection('modelos').find({}, { projection: { slug: 1, marca: 1, nome: 1, raridade: 1, noAlbum: 1 } }).toArray();
    catalogoCache = { em: Date.now(), modelos };
  }
  return catalogoCache.modelos;
}

const resumoModelo = (m) => ({ slug: m.slug, nome: m.nome, marca: m.marca, raridade: m.raridade ?? null, noAlbum: Boolean(m.noAlbum) });

async function apagarFoto(fotoUrl) {
  if (fotoUrl) await unlink(path.join(PASTA_FOTOS, path.basename(fotoUrl))).catch(() => {});
}

await app.register(
  async (api) => {
    const emitirToken = (usuario) => ({ token: jwt.sign({ sub: String(usuario._id), email: usuario.email }, JWT_SECRET, { expiresIn: '30d' }) });

    function lerCredenciais(corpo) {
      const email = String(corpo?.email ?? '').trim().toLowerCase();
      const senha = String(corpo?.senha ?? '');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('E-mail inválido'), { statusCode: 400 });
      if (senha.length < 6) throw Object.assign(new Error('A senha precisa de pelo menos 6 caracteres'), { statusCode: 400 });
      return { email, senha };
    }

    api.post('/auth/cadastro', async (req, reply) => {
      const { email, senha } = lerCredenciais(req.body);
      const usuario = { email, senhaHash: await bcrypt.hash(senha, 10), criadoEm: new Date() };
      try {
        usuario._id = (await db.collection('usuarios').insertOne(usuario)).insertedId;
      } catch (erro) {
        if (erro.code === 11000) return reply.code(409).send({ erro: 'Já existe uma conta com esse e-mail' });
        throw erro;
      }
      return reply.code(201).send(emitirToken(usuario));
    });

    api.post('/auth/login', async (req, reply) => {
      const { email, senha } = lerCredenciais(req.body);
      const usuario = await db.collection('usuarios').findOne({ email });
      if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) return reply.code(401).send({ erro: 'E-mail ou senha incorretos' });
      return emitirToken(usuario);
    });

    // Daqui para baixo, tudo exige usuário autenticado.
    await api.register(async (privado) => {
      privado.addHook('onRequest', async (req, reply) => {
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        try {
          req.usuarioId = new ObjectId(jwt.verify(token, JWT_SECRET).sub);
        } catch {
          return reply.code(401).send({ erro: 'Faça login de novo' });
        }
      });

      privado.post('/capturas', async (req, reply) => {
        const arquivo = await req.file();
        if (!arquivo || !arquivo.mimetype.startsWith('image/')) return reply.code(400).send({ erro: 'Envie uma foto no campo "foto"' });
        const foto = await arquivo.toBuffer();

        const fotoUrl = `/fotos/${randomUUID()}.jpg`;
        await writeFile(path.join(PASTA_FOTOS, path.basename(fotoUrl)), foto);

        const modelos = await catalogo();
        if (!modelos.length) {
          await apagarFoto(fotoUrl);
          return reply.code(503).send({ erro: 'Catálogo vazio: rode npm run catalogo:curadoria' });
        }

        let r;
        try {
          r = await reconhecedor.identify({ foto, catalogo: modelos });
        } catch (erro) {
          req.log.error(erro, 'falha no reconhecimento');
          await apagarFoto(fotoUrl);
          return reply.code(502).send({ erro: 'A IA não respondeu. Tente de novo.' });
        }
        req.log.info({ ia: reconhecedor.nome, slug: r.slug, confianca: r.confianca }, 'reconhecimento');

        if (r.slug === 'desconhecido') {
          await apagarFoto(fotoUrl);
          return { resultado: 'desconhecido' };
        }

        const porSlug = new Map(modelos.map((m) => [m.slug, m]));
        const modelo = porSlug.get(r.slug);
        const captura = {
          usuarioId: req.usuarioId,
          modeloId: modelo._id,
          geracao: r.geracao,
          fotoUrl,
          confianca: r.confianca,
          iaBruto: { reconhecedor: reconhecedor.nome, ...r.bruto },
          criadoEm: new Date(),
        };

        if (r.confianca >= CONFIANCA_MINIMA) {
          const jaTinha = await db.collection('capturas').countDocuments({ usuarioId: req.usuarioId, modeloId: modelo._id, status: 'confirmada' });
          await db.collection('capturas').insertOne({ ...captura, status: 'confirmada' });
          return { resultado: 'capturado', modelo: resumoModelo(modelo), novo: jaTinha === 0, confianca: r.confianca, fotoUrl };
        }

        // Confiança baixa: guarda como pendente e devolve 2 ou 3 palpites para o usuário escolher.
        const palpites = r.palpites.map((s) => porSlug.get(s));
        const { insertedId } = await db.collection('capturas').insertOne({ ...captura, status: 'pendente', palpites: palpites.map((m) => m._id) });
        return { resultado: 'confirmar', capturaId: String(insertedId), palpites: palpites.map(resumoModelo), fotoUrl };
      });

      privado.post('/capturas/:id/confirmar', async (req, reply) => {
        if (!ObjectId.isValid(req.params.id)) return reply.code(404).send({ erro: 'Captura não encontrada' });
        const capturas = db.collection('capturas');
        const captura = await capturas.findOne({ _id: new ObjectId(req.params.id), usuarioId: req.usuarioId, status: 'pendente' });
        if (!captura) return reply.code(404).send({ erro: 'Captura não encontrada' });

        // slug null = "não é nenhum desses": descarta a captura e a foto.
        const slug = req.body?.slug ?? null;
        if (slug === null) {
          await capturas.deleteOne({ _id: captura._id });
          await apagarFoto(captura.fotoUrl);
          return { resultado: 'descartado' };
        }

        const modelo = await db.collection('modelos').findOne({ slug, _id: { $in: captura.palpites } });
        if (!modelo) return reply.code(400).send({ erro: 'Escolha um dos palpites' });

        const jaTinha = await capturas.countDocuments({ usuarioId: req.usuarioId, modeloId: modelo._id, status: 'confirmada' });
        await capturas.updateOne({ _id: captura._id }, { $set: { modeloId: modelo._id, status: 'confirmada' }, $unset: { palpites: '' } });
        return { resultado: 'capturado', modelo: resumoModelo(modelo), novo: jaTinha === 0, fotoUrl: captura.fotoUrl };
      });

      privado.get('/albuns', (req) => listarAlbuns(db, req.usuarioId));

      privado.get('/album/:marca', async (req, reply) => {
        const album = await montarAlbum(db, req.usuarioId, req.params.marca);
        return album ?? reply.code(404).send({ erro: 'Álbum não encontrado' });
      });
    });
  },
  { prefix: '/api' },
);

app.setErrorHandler((erro, req, reply) => {
  const status = erro.statusCode ?? 500;
  if (status >= 500) req.log.error(erro);
  reply.code(status).send({ erro: status >= 500 ? 'Erro interno' : erro.message });
});

await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
app.log.info(`reconhecedor: ${reconhecedor.nome}`);
