import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { app } from './app.mjs';
import { PASTA_FOTOS, fotosEmDisco } from './fotos.mjs';

// Só no servidor local: na Vercel o site sai do CDN e as fotos, do Blob.
const PASTA_WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');

if (fotosEmDisco) {
  await mkdir(PASTA_FOTOS, { recursive: true });
  await app.register(fastifyStatic, { root: PASTA_FOTOS, prefix: '/fotos/', decorateReply: false });
}
if (existsSync(PASTA_WEB)) await app.register(fastifyStatic, { root: PASTA_WEB, prefix: '/' });

await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
