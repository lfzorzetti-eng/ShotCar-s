// Mandar o catálogo inteiro funciona até umas poucas centenas de modelos; acima disso, duas etapas.
const LIMITE_UMA_ETAPA = 300;

const promptModelo = (slugs) => `Identifique o carro na foto.
Escolha SOMENTE entre os modelos abaixo.
Se não for nenhum, use "desconhecido".

Catálogo:
${slugs.join('\n')}

Responda apenas em JSON:
{"slug": "...", "geracao": "...", "confianca": 0.0-1.0, "palpites": ["até 3 slugs do catálogo, do mais provável ao menos provável"]}`;

const promptMarca = (marcas) => `Identifique a marca do carro na foto.
Escolha SOMENTE entre as marcas abaixo.
Se não for nenhuma, use "desconhecido".

Marcas:
${marcas.join('\n')}

Responda apenas em JSON:
{"marca": "..."}`;

function lerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    const trecho = texto.match(/\{[\s\S]*\}/);
    if (!trecho) throw new Error(`Resposta da IA sem JSON: ${texto.slice(0, 200)}`);
    return JSON.parse(trecho[0]);
  }
}

export function criarOllama({ host, apiKey, modelo }) {
  async function perguntar(prompt, imagemBase64) {
    const resposta = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey && { authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [{ role: 'user', content: prompt, images: [imagemBase64] }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!resposta.ok) throw new Error(`Ollama respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
    const corpo = await resposta.json();
    return corpo.message?.content ?? '';
  }

  return {
    nome: `ollama:${modelo}`,

    async identify({ foto, catalogo }) {
      const imagem = foto.toString('base64');
      const bruto = {};
      let candidatos = catalogo;

      if (catalogo.length > LIMITE_UMA_ETAPA) {
        const marcas = [...new Set(catalogo.map((m) => m.marca))];
        bruto.marca = await perguntar(promptMarca(marcas), imagem);
        const { marca } = lerJson(bruto.marca);
        if (!marcas.includes(marca)) return { slug: 'desconhecido', geracao: null, confianca: 0, palpites: [], bruto };
        candidatos = catalogo.filter((m) => m.marca === marca);
      }

      bruto.modelo = await perguntar(promptModelo(candidatos.map((m) => m.slug)), imagem);
      const r = lerJson(bruto.modelo);
      return { slug: r.slug, geracao: r.geracao, confianca: r.confianca, palpites: r.palpites, bruto };
    },
  };
}
