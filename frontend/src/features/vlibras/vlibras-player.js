// Avatar do VLibras (governo federal, código aberto LGPL-3.0: github.com/spbgovbr-vlibras)
// usado SÓ para mostrar o sinal nos exercícios ("Qual sinal é esse?").
//
// Como funciona (widget 7.12):
// - o widget oficial é carregado de vlibras.gov.br e expõe window.vlibras com play(glosa), repeat() etc.;
// - o painel do widget é reposicionado sobre o quadro do exercício (CSS injetado no shadow DOM dele),
//   sem cabeçalho, controles nem legenda (a legenda entregaria a resposta);
// - tocamos a GLOSA revisada com play(), sem a tradução automática (que às vezes erra,
//   ex.: "obrigado" → OBRIGAR, e às vezes fica fora do ar);
// - antes de tocar, conferimos se a glosa existe no dicionário do VLibras: se não existir, o avatar
//   soletraria a palavra letra por letra e entregaria a resposta.
// O player precisa carregar VISÍVEL: o Chrome pausa iframes de outro domínio fora da tela e o player
// 3D não inicia num quadro de tamanho zero. Por isso o painel fica sobre o quadro durante o carregamento.

const VLIBRAS_ROOT = "https://vlibras.gov.br/app";
const VLIBRAS_SIGN_LIST = "https://dicionario2.vlibras.gov.br/signs?version=2018.3.1";
/** Sem prazo curto: em internet lenta o player 3D pode levar minutos no primeiro uso (depois fica em cache). */
const MAX_LOAD_TIME_MS = 5 * 60 * 1000;
const FIRST_RENDER_SETTLE_MS = 2500;

const EXERCISE_PANEL_CSS = `
#vlibras-app { z-index: 45 !important; left: var(--sl-x, 10px) !important; top: var(--sl-y, 60px) !important; right: auto !important; bottom: auto !important;
  transform: none !important; translate: none !important; scale: none !important;
  width: var(--sl-w, 300px) !important; height: var(--sl-h, 380px) !important; border-radius: 6px !important; overflow: hidden !important;
  box-shadow: none !important; transition: none !important; }
#vlibras-app > div { width: 100% !important; height: 100% !important; border-radius: 6px !important; box-shadow: none !important; }
#vlibras-app-content { width: 100% !important; height: 100% !important; background: #fff !important; }
#vlibras-app-content > :not(iframe) { display: none !important; }
#vlibras-app-content > iframe { display: block !important; width: 100% !important; height: 100% !important; max-height: none !important; margin: 0 !important; }`;

const PAGE_CSS =
  "#vlibras-access-wrapper { display: none !important; }" +
  " #vlibras-app-root[data-signa-hidden] { display: none !important; }" +
  // #root#root: especificidade maior que a do CSS do widget (que é injetado depois e venceria o empate).
  " html body #root#root .vlibras--hover, html body #root#root .vlibras--active { text-decoration: none !important; cursor: pointer !important; }";

let loadingPromise = null;
let signTrie = null;

/**
 * Espera até readValue() devolver algo verdadeiro (checa a cada 250 ms).
 * @returns {Promise<any>} o valor encontrado.
 * @throws {Error} se passar de timeoutMs.
 */
function waitFor(readValue, timeoutMs = MAX_LOAD_TIME_MS) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const value = readValue();
      if (value) return resolve(value);
      if (Date.now() - startedAt > timeoutMs) return reject(new Error("o VLibras demorou demais para carregar"));
      setTimeout(check, 250);
    };
    check();
  });
}

const findPanelRoot = () => document.getElementById("vlibras-app-root");

/**
 * CSS da página: esconde o botão flutuante do VLibras e o sublinhado do "passe o mouse para traduzir".
 */
function injectPageStyles() {
  if (document.getElementById("signa-vlibras-css")) return;
  const style = document.createElement("style");
  style.id = "signa-vlibras-css";
  style.textContent = PAGE_CSS;
  document.head.appendChild(style);
}

/**
 * O widget tem "clique num texto para traduzir": ele captura os cliques da página (o avatar passaria
 * a sinalizar a ALTERNATIVA tocada e os botões deixariam de responder). Ele ignora cliques marcados
 * com __vlibrasSyntheticClick; este ouvinte em window (fase de captura) roda antes e marca todos.
 */
function disableClickToTranslate() {
  if (window.__signaClickGuard) return;
  window.__signaClickGuard = true;
  // O CSS do widget ignora descendentes de .vlibras-ignore (sem sublinhado/cursor ao passar o mouse).
  document.getElementById("root")?.classList.add("vlibras-ignore");
  window.addEventListener(
    "click",
    (event) => {
      try {
        Object.defineProperty(event, "__vlibrasSyntheticClick", { value: true });
      } catch {
        // evento já marcado
      }
    },
    true,
  );
}

/**
 * Baixa o script oficial do widget (vlibras.gov.br) uma única vez.
 */
function downloadWidgetScript() {
  return new Promise((resolve, reject) => {
    if (window.VLibras?.Widget) return resolve();
    const script = document.createElement("script");
    script.src = `${VLIBRAS_ROOT}/vlibras-plugin.js`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("não foi possível baixar o VLibras"));
    document.head.appendChild(script);
  });
}

/** O loader abre sozinho se lembrar (localStorage) que estava aberto; abrir de novo quebraria o player. */
async function openPanelOnce() {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const alreadyLoading = findPanelRoot() || document.querySelector('script[src*="vlibras-plugin-app"]');
  if (!alreadyLoading) window.VLibrasWidget.open();
}

/**
 * CSS dentro do shadow DOM do painel: posiciona sobre o quadro (variáveis --sl-*), remove
 * cabeçalho/controles/legenda e fixa o z-index 45 (abaixo da capa de carregamento do app).
 */
function injectPanelStyles(shadowRoot) {
  if (shadowRoot.getElementById("signa-exercise")) return;
  const style = document.createElement("style");
  style.id = "signa-exercise";
  style.textContent = EXERCISE_PANEL_CSS;
  shadowRoot.appendChild(style);
}

/**
 * Sequência completa de carregamento do widget e do player 3D.
 * @returns {Promise<object>} window.vlibras pronto.
 */
async function loadWidget() {
  if (!navigator.onLine) throw new Error("sem internet");
  injectPageStyles();
  disableClickToTranslate();

  window.VLibrasWidget = { ...(window.VLibrasWidget || {}), path: VLIBRAS_ROOT, avatar: "icaro" };
  await downloadWidgetScript();
  new window.VLibras.Widget(VLIBRAS_ROOT);
  await waitFor(() => window.VLibrasWidget?.open);
  await openPanelOnce();

  injectPanelStyles(await waitFor(() => findPanelRoot()?.shadowRoot));
  const player = await waitFor(() => (window.vlibras?.isLoaded && window.vlibras.play ? window.vlibras : null));
  if (player.showSubtitles) player.toggleSubtitles();
  // "isLoaded" chega antes de o boneco 3D aparecer, e o player não avisa quando começa a desenhar.
  // Só nesta primeira carga da sessão, damos um tempo para a capa de carregamento não sair cedo demais.
  await new Promise((resolve) => setTimeout(resolve, FIRST_RENDER_SETTLE_MS));
  return player;
}

/**
 * Carrega o widget (uma vez por sessão; tentativas falhas podem ser repetidas).
 * @returns {Promise<object>} API window.vlibras (play, repeat, stop…).
 * Usado por: SignAvatar.
 */
export function loadVLibras() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = loadWidget();
  loadingPromise.catch(() => {
    loadingPromise = null;
  });
  return loadingPromise;
}

/**
 * Baixa (uma vez) a lista de sinais do VLibras em forma de árvore de letras.
 */
async function loadSignTrie() {
  if (signTrie) return signTrie;
  const response = await fetch(VLIBRAS_SIGN_LIST);
  if (!response.ok) throw new Error("dicionário do VLibras indisponível");
  signTrie = (await response.json()).root;
  return signTrie;
}

/**
 * A palavra existe na árvore de sinais? @returns {boolean}
 */
function trieContains(trie, gloss) {
  let node = trie;
  for (const character of gloss) {
    node = node.children?.[character];
    if (!node) return false;
  }
  return Boolean(node.end);
}

/**
 * A glosa existe no dicionário do VLibras? (todas as palavras, se for composta)
 * Evita que o avatar soletre a palavra e entregue a resposta.
 * @param {string} gloss - ex.: "BOM_DIA".
 * @returns {Promise<boolean>}
 * Usado por: SignAvatar. Útil no painel administrativo para validar glosas ao cadastrar palavras.
 */
export async function glossExists(gloss) {
  const trie = await loadSignTrie();
  return gloss.trim().split(/\s+/).every((word) => trieContains(trie, word));
}

/**
 * Posiciona o painel do avatar sobre um retângulo da tela.
 * @param {DOMRect} rect
 * @returns {boolean} false se o painel ainda não existe.
 */
export function placePanelOver(rect) {
  const panel = findPanelRoot();
  if (!panel) return false;
  panel.style.setProperty("--sl-x", `${rect.left}px`);
  panel.style.setProperty("--sl-y", `${rect.top}px`);
  panel.style.setProperty("--sl-w", `${rect.width}px`);
  panel.style.setProperty("--sl-h", `${rect.height}px`);
  return true;
}

/**
 * Mostra/esconde o painel (fechado, também para o sinal e desliga o "toque para traduzir").
 * @param {boolean} visible
 */
export function setPanelVisible(visible) {
  const panel = findPanelRoot();
  if (!panel) return;
  const player = window.vlibras;
  if (visible) {
    delete panel.dataset.signaHidden;
    if (player && player.isOpen === false) player.setOpen?.(true);
    return;
  }
  panel.dataset.signaHidden = "";
  player?.stop?.();
  if (player?.isOpen) player.setOpen?.(false);
}

/**
 * Faz o avatar sinalizar a glosa (sem legenda). @param {string} gloss
 */
export function playGloss(gloss) {
  const player = window.vlibras;
  if (!player) return;
  if (player.showSubtitles) player.toggleSubtitles();
  player.play(gloss);
}

/**
 * Repete o último sinal. Usado por: botão ↻ da atividade e "Ver de novo" do dicionário.
 */
export function replayLastSign() {
  window.vlibras?.repeat?.();
}
