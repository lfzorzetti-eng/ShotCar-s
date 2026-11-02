// Lista os modelos com visão no Ollama configurado, para escolher OLLAMA_MODEL.
const host = (process.env.OLLAMA_HOST || 'https://ollama.com').replace(/\/$/, '');
const headers = process.env.OLLAMA_API_KEY ? { authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } : {};

const r = await fetch(`${host}/api/tags`, { headers });
if (!r.ok) {
  console.error(`Ollama respondeu ${r.status}: ${await r.text()}`);
  process.exit(1);
}
const { models } = await r.json();

const comVisao = [];
for (const { name } of models) {
  const info = await fetch(`${host}/api/show`, { method: 'POST', headers, body: JSON.stringify({ model: name }) })
    .then((s) => s.json())
    .catch(() => ({}));
  if (info.capabilities?.includes('vision')) comVisao.push(name);
}

console.log(`Modelos com visão em ${host}:\n`);
for (const nome of comVisao.sort()) console.log(`  ${nome}`);
console.log(`\nOLLAMA_MODEL atual: ${process.env.OLLAMA_MODEL || 'gemma4:31b (padrão)'}`);
