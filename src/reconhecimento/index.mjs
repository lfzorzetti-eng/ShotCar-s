import { criarOllama } from './ollama.mjs';

// CarRecognizer: identify({ foto, catalogo }) → { slug, geracao, confianca, palpites, bruto }.
// Trocar de provedor é só criar outro arquivo com a mesma interface e registrar aqui.
export function criarReconhecedor() {
  const tipo = process.env.RECONHECEDOR || 'ollama';
  let base;
  if (tipo === 'ollama') {
    base = criarOllama({
      host: process.env.OLLAMA_HOST || 'https://ollama.com',
      apiKey: process.env.OLLAMA_API_KEY,
      modelo: process.env.OLLAMA_MODEL || 'gemma4:31b',
    });
  } else if (tipo === 'mock') {
    base = criarMock();
  } else {
    throw new Error(`RECONHECEDOR desconhecido: ${tipo} (use ollama ou mock)`);
  }
  return { nome: base.nome, identify: (args) => base.identify(args).then((r) => validar(r, args.catalogo)) };
}

// A IA nunca inventa nomes: qualquer slug fora do catálogo vira "desconhecido".
function validar(r, catalogo) {
  const slugs = new Set(catalogo.map((m) => m.slug));
  const slug = slugs.has(r.slug) ? r.slug : 'desconhecido';
  const confianca = Math.min(1, Math.max(0, Number(r.confianca) || 0));
  const palpites = [...new Set([slug, ...(Array.isArray(r.palpites) ? r.palpites : [])])]
    .filter((s) => slugs.has(s))
    .slice(0, 3);
  return { slug, geracao: r.geracao ? String(r.geracao) : null, confianca, palpites, bruto: r.bruto ?? null };
}

// Para testar o fluxo sem IA: sorteia um modelo e uma confiança.
function criarMock() {
  return {
    nome: 'mock',
    async identify({ catalogo }) {
      const sorteio = () => catalogo[Math.floor(Math.random() * catalogo.length)].slug;
      const confianca = Math.random();
      return { slug: sorteio(), geracao: null, confianca, palpites: [sorteio(), sorteio()], bruto: { mock: true } };
    },
  };
}
