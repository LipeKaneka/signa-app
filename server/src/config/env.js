import "dotenv/config";

/** A chave de serviço é o que separa o backend de qualquer outro chamador: precisa ser longa. */
const MIN_SERVICE_KEY_LENGTH = 64;

/**
 * Lê uma variável de ambiente obrigatória (sem espaços nas pontas).
 * @param {string} name - nome da variável.
 * @returns {string}
 * @throws {Error} se estiver ausente ou vazia (o servidor não sobe).
 */
function readRequired(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name} (veja .env.example)`);
  }
  return value.trim();
}

/**
 * Lê uma variável opcional.
 * @param {string} name - nome da variável.
 * @param {string} defaultValue - valor usado se ela não existir.
 * @returns {string}
 */
function readOptional(name, defaultValue) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : defaultValue;
}

/**
 * Lê SERVICE_KEY (segredo compartilhado com o backend) e exige o tamanho mínimo.
 * @returns {string}
 * @throws {Error} se faltar ou for curta demais.
 */
function readServiceKey() {
  const key = readRequired("SERVICE_KEY");
  if (key.length < MIN_SERVICE_KEY_LENGTH) {
    throw new Error(`SERVICE_KEY precisa ter pelo menos ${MIN_SERVICE_KEY_LENGTH} caracteres`);
  }
  return key;
}

/**
 * Lê ADMIN_SESSION_HOURS: quanto tempo uma sessão do painel vale depois do login.
 * @returns {number} horas (1 a 72; padrão 8).
 * @throws {Error} se estiver fora do intervalo.
 */
function readAdminSessionHours() {
  const hours = Number(readOptional("ADMIN_SESSION_HOURS", "8"));
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) throw new Error("ADMIN_SESSION_HOURS precisa ser um inteiro de 1 a 72");
  return hours;
}

/**
 * E-mail pela API do Mailtrap (recuperação de senha). Sem MAILTRAP_API_TOKEN, nada é enviado (em desenvolvimento,
 * o código vai para o log). MAILTRAP_INBOX_ID (opcional) manda para a caixa de testes (Sandbox) em vez de entregar.
 * @returns {{mailtrapToken: string, mailtrapInboxId: string, fromEmail: string, fromName: string}}
 * @throws {Error} se houver token sem MAIL_FROM_EMAIL válido.
 */
function readMail() {
  const mailtrapToken = readOptional("MAILTRAP_API_TOKEN", "");
  const fromEmail = readOptional("MAIL_FROM_EMAIL", "");
  if (mailtrapToken && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    throw new Error("MAIL_FROM_EMAIL precisa ser um e-mail do domínio verificado no Mailtrap (ex.: nao-responda@seudominio.com)");
  }
  return {
    mailtrapToken,
    mailtrapInboxId: readOptional("MAILTRAP_INBOX_ID", ""),
    fromEmail,
    fromName: readOptional("MAIL_FROM_NAME", "Signa Ludus"),
  };
}

/**
 * Google: ids de cliente OAuth aceitos no login com Google (o "Web client ID" que o app usa), separados por vírgula.
 * Vazio = login com Google desligado.
 * @returns {string[]}
 */
function readGoogleClientIds() {
  return readOptional("GOOGLE_CLIENT_IDS", "").split(",").map((id) => id.trim()).filter(Boolean);
}

/**
 * Lê e valida toda a configuração do servidor de gerenciamento.
 * HOST padrão 127.0.0.1: na mesma máquina do backend, o servidor fica inacessível de fora.
 * Ao mover para outra máquina, troque HOST para o endereço da rede privada.
 * adminCookieSecure: cookie do painel só por HTTPS (padrão: ligado em produção; em 127.0.0.1 via HTTP fica desligado).
 * trustProxy: confiar no proxy da hospedagem (Render etc.), que recebe em HTTPS e repassa em HTTP. Padrão: 1 salto em
 * produção. Sem isso o painel achava que estava em "http" e recusava o login ("Origem não permitida").
 * @returns {Readonly<{nodeEnv: string, host: string, port: number, databaseUrl: string, serviceKey: string,
 *   adminSessionHours: number, adminCookieSecure: boolean, trustProxy: number|false, mail: object, googleClientIds: string[]}>}
 */
export function loadEnvironment() {
  return Object.freeze({
    nodeEnv: readOptional("NODE_ENV", "development"),
    host: readOptional("HOST", "127.0.0.1"),
    port: Number(readOptional("PORT", "8090")),
    databaseUrl: readRequired("DATABASE_URL"),
    serviceKey: readServiceKey(),
    adminSessionHours: readAdminSessionHours(),
    adminCookieSecure: readOptional("ADMIN_COOKIE_SECURE", readOptional("NODE_ENV", "development") === "production" ? "true" : "false") === "true",
    trustProxy: readTrustProxy(),
    mail: Object.freeze(readMail()),
    googleClientIds: Object.freeze(readGoogleClientIds()),
  });
}

/**
 * TRUST_PROXY = quantos proxies confiáveis há na frente do servidor (ex.: 1 no Render) ou "false".
 * @returns {number|false}
 */
function readTrustProxy() {
  const value = readOptional("TRUST_PROXY", readOptional("NODE_ENV", "development") === "production" ? "1" : "false");
  if (value === "false" || value === "0") return false;
  const hops = Number.parseInt(value, 10);
  if (!Number.isInteger(hops) || hops < 1 || hops > 5) throw new Error("TRUST_PROXY deve ser false ou um número de 1 a 5");
  return hops;
}

let cachedEnvironment = null;

/**
 * Configuração validada, lida uma única vez (cache).
 * @returns {ReturnType<typeof loadEnvironment>}
 */
export function getEnvironment() {
  if (!cachedEnvironment) cachedEnvironment = loadEnvironment();
  return cachedEnvironment;
}

/**
 * @returns {boolean} true quando NODE_ENV=development (mostra detalhes extras de erro 500).
 */
export function isDevelopment() {
  return getEnvironment().nodeEnv === "development";
}
