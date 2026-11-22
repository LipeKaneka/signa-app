import { callServer } from "../clients/server-client.js";

/**
 * "Mantém acordado": na hospedagem grátis (Render) o serviço dorme depois de ~15 min sem pedidos e a primeira pessoa
 * espera ~1 min. Este robô pede /health ao PRÓPRIO backend (pelo endereço público, como um visitante) e ao servidor
 * de gerenciamento, para os dois não dormirem.
 *
 * Para chamar menos atenção e não estourar as horas grátis do mês (750 h por conta, somando os serviços):
 * - Intervalo sorteado (7 a 13 min, nunca o mesmo), sempre abaixo dos 15 min de soneca.
 * - Só dentro da janela de horário (KEEP_ALIVE_HOURS, horário de Brasília); fora dela o serviço dorme normalmente
 *   e acorda quando alguém abre o app (wakeUpApi).
 * - Não cutuca se teve uso de verdade há pouco (o próprio uso já mantém acordado).
 * - Rota mais leve que existe (/health, sem banco), um pedido por vez, User-Agent honesto.
 * - Se falhar várias vezes seguidas, espera mais (até 30 min) em vez de insistir.
 * Liga sozinho em produção no Render (RENDER_EXTERNAL_URL) ou com KEEP_ALIVE_URL; KEEP_ALIVE=0 desliga.
 */

const MIN_DELAY_MS = 7 * 60 * 1000;
const MAX_DELAY_MS = 13 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
/** Uso de verdade mais recente que isso: o robô não precisa cutucar. */
const RECENT_ACTIVITY_MS = 6 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 90 * 1000;
const TIME_ZONE = "America/Sao_Paulo";
/** 8h às 20h = 12 h/dia: cabe nas 750 h do mês mesmo com backend E servidor na mesma conta (2 × 12 × 31 = 744 h). */
export const DEFAULT_HOURS = "8-20";

let lastActivityAt = 0;

/** Middleware: anota o uso de verdade (pedidos do app), para o robô não cutucar à toa. Ignora o próprio /health. */
export function noteActivity(req, _res, next) {
  if (!req.path.endsWith("/health")) lastActivityAt = Date.now();
  next();
}

/**
 * "8-20" → {start: 8, end: 20}; "22-6" atravessa a meia-noite; "0-24" = o dia todo. Inválido → padrão.
 * @param {string} [text]
 * @returns {{start: number, end: number}}
 */
export function parseHours(text) {
  const match = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(String(text ?? ""));
  const [start, end] = match ? [Number(match[1]), Number(match[2])] : [];
  if (!match || start > 23 || end > 24 || start === end) return parseHours(DEFAULT_HOURS);
  return { start, end };
}

/** Hora atual em Brasília (0–23), sem depender do fuso da máquina. */
export function hourInBrazil(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE }).format(date));
}

/** A hora está dentro da janela? (fim exclusivo; janela que atravessa a meia-noite também vale) */
export function isWithinHours(hour, { start, end }) {
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Próxima espera: sorteada entre 7 e 13 min; com falhas seguidas, dobra (até 30 min). */
export function nextDelay(failures = 0, random = Math.random) {
  const base = MIN_DELAY_MS + random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return Math.min(base * 2 ** Math.min(failures, 3), MAX_BACKOFF_MS);
}

/** Deve cutucar agora? Só na janela e se não teve uso de verdade há pouco. */
export function shouldPing({ now = Date.now(), hours, lastActivity = lastActivityAt }) {
  return isWithinHours(hourInBrazil(new Date(now)), hours) && now - lastActivity >= RECENT_ACTIVITY_MS;
}

async function pingSelf(publicUrl) {
  const response = await fetch(`${publicUrl}/api/v1/health`, {
    headers: { "User-Agent": "signa-ludus-keepalive", Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/**
 * Liga o robô (uma vez, na subida do backend). Não faz nada fora de produção ou sem endereço público.
 * @param {{nodeEnv: string}} environment
 * @returns {boolean} se ligou.
 * Usado por: index.js.
 */
export function startKeepAlive(environment) {
  const publicUrl = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/$/, "");
  if (environment.nodeEnv !== "production" || process.env.KEEP_ALIVE === "0" || !publicUrl) return false;
  const hours = parseHours(process.env.KEEP_ALIVE_HOURS);
  let failures = 0;

  const schedule = () => setTimeout(tick, nextDelay(failures)).unref();
  async function tick() {
    if (shouldPing({ hours })) {
      // Os dois ao mesmo tempo: o backend por fora (conta como visita) e o servidor de gerenciamento.
      const results = await Promise.allSettled([pingSelf(publicUrl), callServer("/health")]);
      const failed = results.filter((result) => result.status === "rejected");
      failures = failed.length ? failures + 1 : 0;
      if (failed.length) console.warn(`Mantém acordado: ${failed.length} de 2 não responderam (${failed[0].reason?.message}).`);
    }
    schedule();
  }
  schedule();
  console.log(`Mantém acordado ligado: ${publicUrl}, das ${hours.start}h às ${hours.end}h (Brasília), a cada 7–13 min.`);
  return true;
}
