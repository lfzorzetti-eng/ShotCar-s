const app = document.getElementById('app');
const botaoCamera = document.getElementById('botao-camera');
const botaoSair = document.getElementById('sair');

const RARIDADE = {
  comum: 'Comum',
  incomum: 'Incomum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
};

// ---------- sessão e API ----------

const sessao = {
  get token() {
    try {
      return localStorage.getItem('cardex-token');
    } catch {
      return this._token ?? null;
    }
  },
  set token(valor) {
    this._token = valor;
    try {
      valor ? localStorage.setItem('cardex-token', valor) : localStorage.removeItem('cardex-token');
    } catch {}
  },
};

async function api(caminho, { metodo = 'GET', json, form } = {}) {
  const headers = {};
  if (sessao.token) headers.authorization = `Bearer ${sessao.token}`;
  if (json) headers['content-type'] = 'application/json';
  const r = await fetch(`/api${caminho}`, { method: metodo, headers, body: json ? JSON.stringify(json) : form });
  const corpo = await r.json().catch(() => ({}));
  if (r.status === 401 && sessao.token) {
    sessao.token = null;
    location.hash = '#/entrar';
  }
  if (!r.ok) throw new Error(corpo.erro || `Erro ${r.status}`);
  return corpo;
}

// ---------- utilidades de tela ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const selo = (r) => (r ? `<span class="selo r-${r}">${RARIDADE[r]}</span>` : `<span class="selo">Sem raridade</span>`);

const barra = ({ capturados, total }) =>
  `<div class="barra"><div style="width:${total ? (100 * capturados) / total : 0}%"></div></div>`;

const SILHUETA = `<svg viewBox="0 0 64 32" aria-hidden="true"><path d="M6 22c0-3 2-5 5-5l7-6c2-2 4-3 7-3h12c3 0 5 1 7 3l6 6h3c3 0 5 2 5 5v3H6z"/><circle cx="18" cy="25" r="4"/><circle cx="46" cy="25" r="4"/></svg>`;

function cartao(c) {
  const imagem = c.capturado
    ? `<img src="${esc(c.fotoUrl)}" alt="${esc(c.nome)}" loading="lazy" />`
    : `<div class="silhueta">${SILHUETA}</div>`;
  return `<li class="cartao ${c.capturado ? 'capturado' : ''} ${c.raridade ? `borda-${c.raridade}` : ''}">
    ${imagem}
    <div class="info">
      <strong>${esc(c.nome)}</strong>
      ${selo(c.raridade)}
      ${c.vezes > 1 ? `<small>${c.vezes}× capturado</small>` : ''}
    </div>
  </li>`;
}

function erro(mensagem) {
  return `<p class="erro">${esc(mensagem)}</p>`;
}

// ---------- telas ----------

let pararCamera = () => {};

function telaEntrar() {
  app.innerHTML = `
    <section class="entrar">
      <h1>Sua Pokédex de carros</h1>
      <p class="sub">Fotografe carros na rua e complete o álbum de cada marca.</p>
      <form id="form-entrar">
        <label>E-mail <input name="email" type="email" autocomplete="email" required /></label>
        <label>Senha <input name="senha" type="password" autocomplete="current-password" minlength="6" required /></label>
        <div id="msg"></div>
        <button type="submit" data-acao="login" class="primario">Entrar</button>
        <button type="submit" data-acao="cadastro" class="secundario">Criar conta</button>
      </form>
    </section>`;
  const form = document.getElementById('form-entrar');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const acao = e.submitter?.dataset.acao ?? 'login';
    const dados = Object.fromEntries(new FormData(form));
    try {
      const { token } = await api(`/auth/${acao}`, { metodo: 'POST', json: dados });
      sessao.token = token;
      location.hash = '#/albuns';
    } catch (err) {
      document.getElementById('msg').innerHTML = erro(err.message);
    }
  });
}

async function telaAlbuns() {
  app.innerHTML = `<p class="carregando">Carregando álbuns…</p>`;
  const albuns = await api('/albuns');
  if (!albuns.length) {
    app.innerHTML = erro('Nenhum álbum no catálogo ainda. Rode npm run catalogo:curadoria no servidor.');
    return;
  }
  app.innerHTML = `
    <h1>Álbuns</h1>
    <ul class="albuns">
      ${albuns
        .map(
          (a) => `<li><a href="#/album/${esc(a.slug)}">
            <strong>${esc(a.nome)}</strong>
            <span>${a.progresso.capturados}/${a.progresso.total}${a.garagem ? ` · ${a.garagem} na Garagem` : ''}</span>
            ${barra(a.progresso)}
          </a></li>`,
        )
        .join('')}
    </ul>`;
}

async function telaAlbum(marca) {
  app.innerHTML = `<p class="carregando">Carregando álbum…</p>`;
  const a = await api(`/album/${encodeURIComponent(marca)}`);
  const raridades = Object.entries(a.porRaridade)
    .map(([r, p]) => `<li>${selo(r)} ${p.capturados}/${p.total}</li>`)
    .join('');
  app.innerHTML = `
    <a href="#/albuns" class="voltar">← Álbuns</a>
    <h1>${esc(a.marca.nome)} <small>${a.progresso.capturados}/${a.progresso.total}</small></h1>
    ${barra(a.progresso)}
    <ul class="raridades">${raridades}</ul>
    <ul class="grade">${a.espacos.map(cartao).join('')}</ul>
    <h2>Garagem</h2>
    ${
      a.garagem.length
        ? `<p class="sub">Carros da ${esc(a.marca.nome)} fora da curadoria. Não contam no progresso.</p><ul class="grade">${a.garagem.map(cartao).join('')}</ul>`
        : `<p class="sub">Nada por aqui ainda. Carros reconhecidos fora do álbum aparecem aqui.</p>`
    }`;
}

async function telaCamera() {
  botaoCamera.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    app.innerHTML = erro('Câmera indisponível. No celular, abra o app por HTTPS (ngrok ou Cloudflare Tunnel).');
    return;
  }
  app.innerHTML = `
    <section class="camera">
      <video id="video" autoplay playsinline muted></video>
      <div class="controles">
        <a href="#/albuns" class="secundario">Cancelar</a>
        <button id="disparar" class="disparo" aria-label="Capturar"></button>
      </div>
      <div id="resultado"></div>
    </section>`;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (err) {
    app.innerHTML = erro(`Não consegui abrir a câmera: ${err.message}`);
    return;
  }
  const video = document.getElementById('video');
  video.srcObject = stream;
  pararCamera = () => stream.getTracks().forEach((t) => t.stop());

  document.getElementById('disparar').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const foto = await capturarFrame(video);
    video.pause();
    mostrarResultado(`<p class="carregando">Identificando o carro…</p>`);
    const form = new FormData();
    form.append('foto', foto, 'captura.jpg');
    try {
      tratarResultado(await api('/capturas', { metodo: 'POST', form }));
    } catch (err) {
      mostrarResultado(`${erro(err.message)}<button class="primario" data-de-novo>Tentar de novo</button>`);
    }
  });
}

// O frame vira blob no <canvas>, reduzido para no máximo 1280px no lado maior.
function capturarFrame(video) {
  const escala = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * escala);
  canvas.height = Math.round(video.videoHeight * escala);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
}

function mostrarResultado(html) {
  const caixa = document.getElementById('resultado');
  caixa.innerHTML = `<div class="painel">${html}</div>`;
  caixa.querySelector('[data-de-novo]')?.addEventListener('click', () => {
    caixa.innerHTML = '';
    document.getElementById('video').play();
    document.getElementById('disparar').disabled = false;
  });
}

function tratarResultado(r) {
  if (r.resultado === 'capturado') {
    const m = r.modelo;
    mostrarResultado(`
      <p class="titulo-resultado">${r.novo ? 'Novo carro!' : 'Capturado de novo'}</p>
      <h2>${esc(m.nome)}</h2>
      ${selo(m.raridade)}
      <p class="sub">${m.noAlbum ? 'Entrou no álbum' : 'Foi para a Garagem'} da marca.</p>
      <a class="primario" href="#/album/${esc(m.marca)}">Ver álbum</a>
      <button class="secundario" data-de-novo>Fotografar outro</button>`);
  } else if (r.resultado === 'confirmar') {
    mostrarResultado(`
      <p class="titulo-resultado">Não tenho certeza. Qual é?</p>
      <div class="palpites">
        ${r.palpites.map((p) => `<button class="secundario" data-slug="${esc(p.slug)}">${esc(p.nome)} <small>${esc(p.marca)}</small></button>`).join('')}
        <button class="link" data-slug="">Nenhum desses</button>
      </div>`);
    document.querySelectorAll('[data-slug]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          const resposta = await api(`/capturas/${r.capturaId}/confirmar`, { metodo: 'POST', json: { slug: b.dataset.slug || null } });
          if (resposta.resultado === 'descartado') mostrarResultado(`<p>Captura descartada.</p><button class="primario" data-de-novo>Fotografar outro</button>`);
          else tratarResultado(resposta);
        } catch (err) {
          mostrarResultado(`${erro(err.message)}<button class="primario" data-de-novo>Tentar de novo</button>`);
        }
      }),
    );
  } else {
    mostrarResultado(`
      <p class="titulo-resultado">Não reconheci esse carro</p>
      <p class="sub">Ele não está no catálogo ou a foto não ficou clara. Nada foi salvo.</p>
      <button class="primario" data-de-novo>Tentar de novo</button>`);
  }
}

// ---------- roteamento ----------

async function rotear() {
  pararCamera();
  pararCamera = () => {};
  const [, rota, parametro] = location.hash.split('/');
  const logado = Boolean(sessao.token);
  botaoSair.hidden = !logado;
  botaoCamera.hidden = !logado;

  if (!logado) return telaEntrar();
  try {
    if (rota === 'album' && parametro) await telaAlbum(decodeURIComponent(parametro));
    else if (rota === 'camera') await telaCamera();
    else await telaAlbuns();
  } catch (err) {
    app.innerHTML = erro(err.message);
  }
}

botaoSair.addEventListener('click', () => {
  sessao.token = null;
  location.hash = '#/entrar';
  rotear();
});
window.addEventListener('hashchange', rotear);
rotear();
