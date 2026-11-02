// Minúsculas, sem acento, só letras e números separados por espaço.
export function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const slugify = (texto) => normalizar(texto).replace(/ /g, '-');

// Sinônimos de marca (como vêm das fontes) → slug da marca.
const SINONIMOS = {
  'vw volkswagen': 'volkswagen',
  vw: 'volkswagen',
  'gm chevrolet': 'chevrolet',
  gm: 'chevrolet',
  chevy: 'chevrolet',
  'mercedes benz': 'mercedes-benz',
  mercedes: 'mercedes-benz',
};

// Sub-marcas entram como modelo da marca-mãe: "Mercedes-AMG GT" → mercedes-benz / "amg gt".
const SUB_MARCAS = {
  'mercedes amg': { marca: 'mercedes-benz', prefixo: 'amg' },
  amg: { marca: 'mercedes-benz', prefixo: 'amg' },
  ram: { marca: 'dodge', prefixo: 'ram' },
  abarth: { marca: 'fiat', prefixo: 'abarth' },
};

export function resolverMarca(nome) {
  const n = normalizar(nome);
  if (SUB_MARCAS[n]) return { ...SUB_MARCAS[n], original: n };
  return { marca: SINONIMOS[n] ?? n.replace(/ /g, '-'), prefixo: null, original: n };
}

export function tituloDe(nomeNormalizado) {
  return nomeNormalizado.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
