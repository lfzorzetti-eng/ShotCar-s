import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { del, put } from '@vercel/blob';

export const PASTA_FOTOS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

// Na Vercel o disco é somente leitura e some entre execuções: lá as fotos vão para o Blob.
export const fotosEmDisco = !process.env.BLOB_READ_WRITE_TOKEN;

export async function salvarFoto(foto) {
  const nome = `${randomUUID()}.jpg`;
  if (fotosEmDisco) {
    await writeFile(path.join(PASTA_FOTOS, nome), foto);
    return `/fotos/${nome}`;
  }
  const { url } = await put(`fotos/${nome}`, foto, { access: 'public', contentType: 'image/jpeg' });
  return url;
}

export async function apagarFoto(fotoUrl) {
  if (!fotoUrl) return;
  if (fotoUrl.startsWith('/fotos/')) await unlink(path.join(PASTA_FOTOS, path.basename(fotoUrl))).catch(() => {});
  else await del(fotoUrl).catch(() => {});
}
