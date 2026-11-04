const RARIDADE = {
  comum: 'Comum',
  incomum: 'Incomum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- sessão e API ----------

const sessao = {
  get token() {
    try {
      return localStorage.getItem('shotcars-token');
    } catch {
      return this._token ?? null;
    }
  },
  set token(valor) {
    this._token = valor;
    try {
      valor ? localStorage.setItem('shotcars-token', valor) : localStorage.removeItem('shotcars-token');
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
    aplicarSessao();
    rota();
  }
  if (!r.ok) throw new Error(corpo.erro || `Erro ${r.status}`);
  return corpo;
}

// O e-mail vem do próprio token, só para a inicial do avatar.
function emailDoToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email;
  } catch {
    return '';
  }
}

// ---------- utilidades de tela ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const badge = (r) => (r ? `<span class="badge" data-r="${r}">${RARIDADE[r]}</span>` : `<span class="badge" data-r="comum">Sem raridade</span>`);

const vezesCapturado = (n) => (n === 1 ? 'Capturado 1 vez' : `Capturado ${n} vezes`);

function cartao(c, i, meta = c.capturado ? vezesCapturado(c.vezes) : 'Ainda não capturado') {
  const arte = c.capturado
    ? `<img src="${esc(c.fotoUrl)}" alt="${esc(c.nome)}" loading="lazy" />`
    : `<svg viewBox="0 0 300 120" aria-hidden="true"><use href="#coupe"/></svg>`;
  return `<article class="slot glass rc ${c.capturado ? '' : 'is-missing'}" data-r="${c.raridade ?? 'comum'}" style="--i:${i}">
    <div class="slot-art">${arte}</div>
    <div class="slot-top"><span class="slot-name">${c.capturado ? esc(c.nome) : '???'}</span>${badge(c.raridade)}</div>
    <div class="slot-meta">${meta}</div>
  </article>`;
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-shown');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('is-shown'), 2600);
}

function aviso(texto, { erro = false } = {}) {
  $('#aviso-texto').textContent = texto;
  $('#aviso').classList.toggle('is-erro', erro);
  $('#aviso').hidden = false;
}

// ---------- contadores que sobem ----------

function contar(el) {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const alvo = Number(el.dataset.count);
  if (reduced) {
    el.textContent = alvo;
    return;
  }
  const t0 = performance.now();
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / 1100);
    el.textContent = Math.round(alvo * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// ---------- entrada por scroll ----------

const io = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.classList.add('is-in');
      $$('[data-count]', el).forEach((c) => setTimeout(() => contar(c), 400));
      $$('.ring', el).forEach((r) => r.style.setProperty('--p', r.dataset.p));
      if (el.id === 'demo-camera') escanearDemo();
      io.unobserve(el);
    }
  },
  { threshold: 0.18 },
);
const observar = (root) => $$('.reveal', root).forEach((el) => el.classList.contains('is-in') || io.observe(el));

// Visor da landing: varre, trava no carro, mostra o resultado.
function escanearDemo() {
  const vf = $('#demo-vf');
  const c = $('[data-count]', vf);
  vf.classList.remove('is-scanning', 'is-locked');
  delete c.dataset.done;
  c.textContent = '0';
  void vf.offsetWidth;
  vf.classList.add('is-scanning');
  setTimeout(
    () => {
      vf.classList.add('is-locked');
      contar(c);
    },
    reduced ? 0 : 1150,
  );
}
$('#demo-vf .shutter').addEventListener('click', escanearDemo);

// ---------- parallax do hero ligado ao scroll ----------

const deck = $('#deck');
const heroCopy = $('.hero-copy');
let pedindo = false;
function aoRolar() {
  if (pedindo || reduced || document.body.dataset.view !== 'inicio') return;
  pedindo = true;
  requestAnimationFrame(() => {
    const y = Math.min(scrollY, 700);
    heroCopy.style.setProperty('--sy', y);
    deck.style.setProperty('--sy', y);
    $$('.card', deck).forEach((c) => c.style.setProperty('--spread', Math.min(y, 400) * 0.25));
    pedindo = false;
  });
}
addEventListener('scroll', aoRolar, { passive: true });

// ---------- carta que gira com o scroll ----------

// O scroll define um alvo (0 a 1); a carta persegue o alvo com inércia,
// o que dá a sensação de mola em vez de seguir o dedo de forma rígida.
const scrolly = $('#scrolly');
const flip = $('#flip');
const glowEl = $('#scene-glow');
const ghost = $('#slot-ghost');
const steps = $$('.step', scrolly);
const dots = $$('.progress-dots i', scrolly);
const clamp = (v) => Math.max(0, Math.min(1, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const suave = (k) => k * k * (3 - 2 * k);
let alvo = 0;
let atual = 0;
let girando = false;

function progressoScrolly() {
  const r = scrolly.getBoundingClientRect();
  return clamp(-r.top / (r.height - innerHeight));
}

function desenharCarta(p) {
  const pousa = suave(seg(p, 0, 0.22));
  const inclina = suave(seg(p, 0.22, 0.45));
  const vira = suave(seg(p, 0.45, 0.72));
  const encaixa = suave(seg(p, 0.72, 1));
  const rx = 58 * (1 - pousa) + 8 * inclina * (1 - vira) - 4 * encaixa;
  const ry = -32 * inclina + 212 * vira - 14 * encaixa;
  const rz = -20 * (1 - pousa) + 4 * inclina * (1 - vira);
  const s = 0.55 + 0.45 * pousa + 0.1 * vira - 0.12 * encaixa;
  const ty = 180 * (1 - pousa) - 30 * vira * (1 - encaixa);
  flip.style.transform = `translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`;
  flip.style.setProperty('--sheen', ((ry % 360) / 3).toFixed(1));
  glowEl.style.setProperty('--glow', (0.25 + 0.5 * pousa + 0.25 * vira).toFixed(2));
  ghost.style.setProperty('--ghost', encaixa.toFixed(2));

  const ativo = p < 0.22 ? 0 : p < 0.45 ? 1 : p < 0.72 ? 2 : 3;
  steps.forEach((el, i) => el.classList.toggle('is-active', i === ativo));
  const limites = [
    [0, 0.22],
    [0.22, 0.45],
    [0.45, 0.72],
    [0.72, 1],
  ];
  dots.forEach((d, i) => d.style.setProperty('--f', seg(p, ...limites[i]).toFixed(3)));
}

function animarCarta() {
  atual += (alvo - atual) * 0.12;
  if (Math.abs(alvo - atual) < 0.0005) atual = alvo;
  desenharCarta(atual);
  girando = atual !== alvo;
  if (girando) requestAnimationFrame(animarCarta);
}

function aoRolarCarta() {
  if (document.body.dataset.view !== 'inicio') return;
  alvo = progressoScrolly();
  if (reduced) {
    desenharCarta(0.22);
    return;
  }
  if (!girando) {
    girando = true;
    requestAnimationFrame(animarCarta);
  }
}
addEventListener('scroll', aoRolarCarta, { passive: true });
addEventListener('resize', aoRolarCarta);
desenharCarta(reduced ? 0.22 : 0);

function distribuirCartas() {
  deck.classList.remove('is-dealt', 'is-settled');
  void deck.offsetWidth;
  setTimeout(() => deck.classList.add('is-dealt'), reduced ? 0 : 250);
  setTimeout(() => deck.classList.add('is-settled'), reduced ? 0 : 1500);
}

// A carta da frente inclina conforme o ponteiro.
if (!reduced && matchMedia('(pointer: fine)').matches) {
  const front = $('.is-front', deck);
  const stage = deck.parentElement;
  stage.addEventListener('pointermove', (e) => {
    const r = deck.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / r.width;
    const y = (e.clientY - (r.top + r.height / 2)) / r.height;
    front.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 12}deg) translateZ(30px)`;
  });
  stage.addEventListener('pointerleave', () => {
    front.style.transform = '';
  });
}

// ---------- álbuns ----------

function renderAlbuns(albuns) {
  const soma = (f) => albuns.reduce((s, a) => s + f(a), 0);
  $('#summary').innerHTML = `
    <div><strong data-count="${soma((a) => a.progresso.capturados)}">0</strong>capturados</div>
    <div><strong data-count="${soma((a) => a.progresso.total)}">0</strong>espaços</div>
    <div><strong data-count="${soma((a) => a.raros)}">0</strong>raros ou acima</div>`;
  $('#brand-grid').innerHTML = albuns
    .map((a, i) => {
      const { capturados, total } = a.progresso;
      const p = Math.round((capturados / total) * 100);
      return `<a class="brand-tile glass rc" style="--i:${i}" href="#/album/${esc(a.slug)}">
        <div class="ring" data-p="${p}"><span>${p}%</span></div>
        <div><h3>${esc(a.nome)}</h3><p>${capturados} de ${total} espaços${a.garagem ? ` · ${a.garagem} na Garagem` : ''}</p>
        <div class="best">${a.melhorRaridade ? badge(a.melhorRaridade) : '<span class="badge" data-r="comum">Nenhum ainda</span>'}</div></div>
      </a>`;
    })
    .join('');
}

function renderAlbum(a) {
  const { capturados, total } = a.progresso;
  const p = total ? Math.round((capturados / total) * 100) : 0;
  const raridades = Object.entries(a.porRaridade)
    .map(([r, n]) => `<span class="badge" data-r="${r}">${RARIDADE[r]} ${n.capturados}/${n.total}</span>`)
    .join('');
  $('#album-page').innerHTML = `
    <a class="back" href="#/albuns"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Álbuns</a>
    <div class="page-head reveal">
      <div><h1 class="page-title">${esc(a.marca.nome)}</h1><p class="page-sub">${capturados === total ? 'Álbum completo.' : total - capturados === 1 ? 'Falta 1 carro para completar.' : `Faltam ${total - capturados} carros para completar.`}</p></div>
      <div class="album-progress"><div class="album-progress-top"><span>Progresso</span><span>${capturados} de ${total}</span></div><div class="bar"><i style="--w:${p}%"></i></div></div>
    </div>
    <div class="rar-summary reveal">${raridades}</div>
    <div class="slots reveal">${a.espacos.map((e, i) => cartao(e, i)).join('')}</div>
    ${
      a.garagem.length
        ? `<h2 class="section-label reveal">Na Garagem</h2>
    <div class="slots reveal">${a.garagem.map((g, i) => cartao(g, i, 'Fora do álbum')).join('')}</div>`
        : ''
    }`;
}

// ---------- garagem ----------

function renderGaragem(grupos) {
  $('#garage-list').innerHTML = grupos.length
    ? grupos
        .map(
          (g) => `<div class="garage-group reveal">
        <h2>${esc(g.marca.nome)}</h2>
        <div class="slots">${g.carros.map((c, i) => cartao(c, i)).join('')}</div>
      </div>`,
        )
        .join('')
    : `<div class="empty glass">A Garagem está vazia. Carros fora dos álbuns aparecem aqui.</div>`;
}

// ---------- câmera ----------

let stream = null;
let pedidoCamera = 0; // Sobe ao abrir e ao sair: resposta de um pedido antigo é ignorada.
let capturaPendente = null;

function lado(titulo, texto) {
  $('#side-title').textContent = titulo;
  $('#side-text').textContent = texto;
}

function prontoParaCapturar(titulo = 'Pronto para capturar', texto = 'Enquadre o carro e toque no botão branco.') {
  $('#result').classList.remove('is-shown');
  $('#cam-ui').classList.remove('is-locked', 'is-scanning');
  lado(titulo, texto);
  $('#cam-video').play();
  $('#cam-shutter').disabled = false;
}

async function abrirCamera() {
  const pedido = ++pedidoCamera;
  $('#cam-allow').hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    lado('Câmera indisponível', 'No celular, abra o app por HTTPS (ngrok ou Cloudflare Tunnel).');
    return;
  }
  lado('Abrindo a câmera', 'Se o navegador perguntar, permita o acesso à câmera.');
  try {
    const aberto = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    if (pedido !== pedidoCamera) {
      aberto.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = aberto;
    $('#cam-video').srcObject = stream;
    $('#cam').classList.add('has-stream');
    $('#cam-status').textContent = 'Câmera ao vivo';
    prontoParaCapturar();
  } catch (err) {
    if (pedido !== pedidoCamera) return;
    lado('Câmera bloqueada', `Não consegui abrir a câmera: ${err.message}`);
    $('#cam-allow').hidden = false;
  }
}

function pararCamera() {
  pedidoCamera++;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  capturaPendente = null;
  $('#cam-video').srcObject = null;
  $('#cam').classList.remove('has-stream');
  $('#cam-status').textContent = 'Câmera desligada';
  $('#cam-shutter').disabled = true;
  $('#cam-ui').classList.remove('is-locked', 'is-scanning');
  $('#result').classList.remove('is-shown');
}
$('#cam-allow').addEventListener('click', abrirCamera);

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
  const caixa = $('#result');
  $('#cam-ui').classList.remove('is-scanning');
  caixa.innerHTML = html;
  caixa.classList.add('is-shown');
  // No celular o painel fica abaixo da câmera, atrás da barra inferior.
  caixa.scrollIntoView({ block: 'nearest' });
}

function mostrarFalha(mensagem) {
  lado('Algo deu errado', mensagem);
  mostrarResultado(`<button class="btn btn-primary" type="button" data-de-novo>Tentar de novo</button>`);
}

$('#cam-shutter').addEventListener('click', async (e) => {
  const video = $('#cam-video');
  const ui = $('#cam-ui');
  const pedido = pedidoCamera;
  e.currentTarget.disabled = true;
  $('#flash').animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: reduced ? 1 : 450, easing: 'ease-out' });
  const foto = await capturarFrame(video);
  video.pause();
  ui.classList.remove('is-scanning', 'is-locked');
  void ui.offsetWidth;
  ui.classList.add('is-scanning');
  $('#result').classList.remove('is-shown');
  lado('Reconhecendo', 'Comparando com o catálogo.');

  const form = new FormData();
  form.append('foto', foto, 'captura.jpg');
  try {
    const r = await api('/capturas', { metodo: 'POST', form });
    if (pedido === pedidoCamera) tratarResultado(r);
  } catch (err) {
    if (pedido === pedidoCamera) mostrarFalha(err.message);
  }
});

function tratarResultado(r) {
  if (r.resultado === 'capturado') {
    const m = r.modelo;
    capturaPendente = null;
    $('#cam-ui').classList.add('is-locked');
    lado(r.novo ? 'Novo carro!' : 'Capturado de novo', `${m.noAlbum ? 'Entrou no álbum' : 'Foi para a Garagem'} da marca.`);
    mostrarResultado(`
      ${badge(m.raridade)}
      <div class="result-name">${esc(m.nome)}</div>
      <div class="result-marca">${esc(m.marca)}</div>
      ${r.confianca ? `<div class="result-conf">${Math.round(r.confianca * 100)}% de certeza</div>` : ''}
      <a class="btn btn-primary" href="${m.noAlbum ? `#/album/${esc(m.marca)}` : '#/garagem'}">${m.noAlbum ? 'Ver álbum' : 'Ver Garagem'}</a>
      <button class="btn btn-glass" type="button" data-de-novo>Fotografar outro</button>`);
  } else if (r.resultado === 'confirmar') {
    capturaPendente = r.capturaId;
    lado('Qual destes?', 'A IA não teve certeza. Escolha o modelo certo.');
    mostrarResultado(`<div class="guesses">
      ${r.palpites.map((p) => `<button class="guess" type="button" data-slug="${esc(p.slug)}"><span>${esc(p.nome)} <small>${esc(p.marca)}</small></span>${badge(p.raridade)}</button>`).join('')}
      <button class="link-btn" type="button" data-slug="">Nenhum desses</button>
    </div>`);
  } else {
    lado('Não reconheci esse carro', 'Ele não está no catálogo ou a foto não ficou clara. Nada foi salvo.');
    mostrarResultado(`<button class="btn btn-primary" type="button" data-de-novo>Tentar de novo</button>`);
  }
}

async function confirmarPalpite(slug) {
  const pedido = pedidoCamera;
  $$('#result button').forEach((b) => (b.disabled = true));
  try {
    const r = await api(`/capturas/${capturaPendente}/confirmar`, { metodo: 'POST', json: { slug } });
    if (pedido !== pedidoCamera) return;
    if (r.resultado === 'descartado') prontoParaCapturar('Captura descartada', 'Enquadre o próximo carro.');
    else tratarResultado(r);
  } catch (err) {
    if (pedido === pedidoCamera) mostrarFalha(err.message);
  }
}

$('#result').addEventListener('click', (e) => {
  const palpite = e.target.closest('[data-slug]');
  if (palpite) confirmarPalpite(palpite.dataset.slug || null);
  else if (e.target.closest('[data-de-novo]')) prontoParaCapturar();
});

// ---------- janela de login ----------

let modo = 'entrar';
let depoisDoLogin = '#/albuns';
const auth = $('#auth');
const form = $('#auth-form');
const COPY = {
  entrar: { titulo: 'Entrar', sub: 'Seus álbuns continuam de onde você parou.', botao: 'Entrar', auto: 'current-password' },
  criar: { titulo: 'Criar conta', sub: 'Leva menos de um minuto. Depois é só apontar a câmera.', botao: 'Criar conta', auto: 'new-password' },
};

function aplicarSessao() {
  const logado = Boolean(sessao.token);
  document.body.classList.toggle('is-logged', logado);
  $('#brand').setAttribute('href', logado ? '#/albuns' : '#/');
  if (logado) $('#avatar').textContent = emailDoToken(sessao.token).charAt(0).toUpperCase() || '?';
}

function definirModo(m) {
  modo = m;
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
  $('#auth-title').textContent = COPY[m].titulo;
  $('#auth-sub').textContent = COPY[m].sub;
  $('#auth-submit').textContent = COPY[m].botao;
  $('#f-senha').setAttribute('autocomplete', COPY[m].auto);
  limparErros();
}

function abrirLogin(m = 'entrar') {
  definirModo(m);
  auth.classList.add('is-open');
  auth.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#f-email').focus(), 150);
}

function fecharLogin() {
  auth.classList.remove('is-open');
  auth.setAttribute('aria-hidden', 'true');
}

function limparErros() {
  $$('.err', form).forEach((e) => (e.textContent = ''));
  $$('input', form).forEach((i) => i.removeAttribute('aria-invalid'));
}

function erroCampo(campo, msg) {
  $(`#e-${campo}`).textContent = msg;
  $(`#f-${campo}`).setAttribute('aria-invalid', 'true');
}

function sacudir() {
  const card = $('.auth-card');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

$$('[data-auth]').forEach((b) => b.addEventListener('click', () => abrirLogin(b.dataset.auth)));
$$('.seg button').forEach((b) => b.addEventListener('click', () => definirModo(b.dataset.modo)));
$('#auth-close').addEventListener('click', fecharLogin);
auth.addEventListener('click', (e) => {
  if (e.target === auth) fecharLogin();
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && auth.classList.contains('is-open')) fecharLogin();
});
$$('input', form).forEach((i) =>
  i.addEventListener('input', () => {
    i.removeAttribute('aria-invalid');
    $(`#e-${i.name}`).textContent = '';
  }),
);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErros();
  const email = $('#f-email').value.trim();
  const senha = $('#f-senha').value;
  let ok = true;
  if (!email) {
    erroCampo('email', 'Digite seu e-mail.');
    ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    erroCampo('email', 'Esse e-mail não parece válido. Confira se tem @ e domínio.');
    ok = false;
  }
  if (senha.length < 6) {
    erroCampo('senha', 'A senha precisa ter pelo menos 6 caracteres.');
    ok = false;
  }
  if (!ok) return sacudir();

  const botao = $('#auth-submit');
  botao.disabled = true;
  try {
    const { token } = await api(`/auth/${modo === 'criar' ? 'cadastro' : 'login'}`, { metodo: 'POST', json: { email, senha } });
    sessao.token = token;
    form.reset();
    fecharLogin();
    aplicarSessao();
    toast(modo === 'criar' ? 'Conta criada. Aponte a câmera para o primeiro carro.' : 'Que bom ver você de novo');
    const destino = depoisDoLogin;
    depoisDoLogin = '#/albuns';
    if (location.hash === destino) rota();
    else location.hash = destino;
  } catch (err) {
    erroCampo(modo === 'criar' ? 'email' : 'senha', err.message);
    sacudir();
  } finally {
    botao.disabled = false;
  }
});

$('#sair').addEventListener('click', () => {
  sessao.token = null;
  aplicarSessao();
  toast('Você saiu da conta');
  location.hash = '#/';
});

// ---------- roteamento ----------

const PROTEGIDAS = ['camera', 'albuns', 'album', 'garagem'];
let rotaAtual = 0; // Se o usuário trocar de aba no meio de um fetch, a resposta antiga é descartada.

function buscarDados(view, marca) {
  if (view === 'albuns') return api('/albuns');
  if (view === 'album') return api(`/album/${encodeURIComponent(marca)}`);
  if (view === 'garagem') return api('/garagem');
}

function renderizar(view, dados) {
  if (view === 'albuns') {
    if (!dados.length) return aviso('Nenhum álbum no catálogo ainda. Rode npm run catalogo:curadoria no servidor.');
    renderAlbuns(dados);
  }
  if (view === 'album') renderAlbum(dados);
  if (view === 'garagem') renderGaragem(dados);
}

async function rota() {
  const id = ++rotaAtual;
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let view = partes[0] === 'album' && partes[1] ? 'album' : ['camera', 'albuns', 'garagem'].includes(partes[0]) ? partes[0] : 'inicio';
  const logado = Boolean(sessao.token);

  // Logado não volta para a apresentação; deslogado não entra nas funcionalidades.
  if (logado && view === 'inicio') {
    location.replace('#/albuns');
    return;
  }
  if (!logado && PROTEGIDAS.includes(view)) {
    depoisDoLogin = location.hash;
    history.replaceState(null, '', '#/');
    view = 'inicio';
    setTimeout(() => abrirLogin('entrar'), 300);
  }
  const tab = view === 'album' ? 'albuns' : view;

  if (view !== 'camera') pararCamera();
  $('#aviso').hidden = true;
  if (view === 'album') $('#album-page').innerHTML = '';

  document.body.dataset.view = view;
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
  $$('[data-tab]').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));

  scrollTo({ top: 0, behavior: 'instant' });
  if (view === 'inicio') {
    distribuirCartas();
    heroCopy.style.setProperty('--sy', 0);
    deck.style.setProperty('--sy', 0);
  }
  if (view === 'camera') abrirCamera();

  const viewEl = $(`.view[data-view="${view}"]`);
  // Cada visita à aba repete as entradas.
  $$('.reveal', viewEl).forEach((el) => {
    el.classList.remove('is-in');
    io.unobserve(el);
  });
  $$('[data-count]', viewEl).forEach((c) => delete c.dataset.done);

  const carregando = setTimeout(() => id === rotaAtual && aviso('Carregando…'), 200);
  try {
    const dados = await buscarDados(view, partes[1] && decodeURIComponent(partes[1]));
    if (id !== rotaAtual) return;
    $('#aviso').hidden = true;
    renderizar(view, dados);
  } catch (err) {
    if (id === rotaAtual) aviso(err.message, { erro: true });
    return;
  } finally {
    clearTimeout(carregando);
  }
  requestAnimationFrame(() => observar(viewEl));
}

addEventListener('hashchange', rota);
aplicarSessao();
rota();
