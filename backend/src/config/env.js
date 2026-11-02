import "dotenv/config";

const MIN_JWT_SECRET_LENGTH = 128;
const MIN_SERVICE_KEY_LENGTH = 64;

/**
 * Lê uma variável de ambiente obrigatória (sem espaços nas pontas).
 * @param {string} name - nome da variável.
 * @returns {string}
 * @throws {Error} se estiver ausente ou vazia (a API não sobe).
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
 * Converte FRONTEND_URL ("a,b,c") em lista de origens sem barra final.
 * @returns {string[]}
 */
function readFrontendOrigins() {
  return readOptional("FRONTEND_URL", "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * Lê JWT_SECRET e exige o tamanho mínimo (MIN_JWT_SECRET_LENGTH).
 * @returns {string}
 * @throws {Error} se faltar ou for curto demais.
 */
function readJwtSecret() {
  const secret = readRequired("JWT_SECRET");
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET precisa ter pelo menos ${MIN_JWT_SECRET_LENGTH} caracteres`);
  }
  return secret;
}

/**
 * Lê SERVER_SERVICE_KEY (mesmo valor de SERVICE_KEY no server/.env) e exige o tamanho mínimo.
 * @returns {string}
 * @throws {Error} se faltar ou for curta demais.
 */
function readServerServiceKey() {
  const key = readRequired("SERVER_SERVICE_KEY");
  if (key.length < MIN_SERVICE_KEY_LENGTH) {
    throw new Error(`SERVER_SERVICE_KEY precisa ter pelo menos ${MIN_SERVICE_KEY_LENGTH} caracteres`);
  }
  return key;
}

/**
 * Lê CONTENT_VERSION_TTL_MS: de quanto em quanto tempo o backend confere se o conteúdo mudou no servidor.
 * @returns {number} milissegundos (0 = confere a cada pedido; padrão 10000).
 * @throws {Error} se não for um número inteiro >= 0.
 */
function readContentVersionTtl() {
  const value = Number(readOptional("CONTENT_VERSION_TTL_MS", "10000"));
  if (!Number.isInteger(value) || value < 0) throw new Error("CONTENT_VERSION_TTL_MS precisa ser um inteiro >= 0");
  return value;
}

/**
 * Lê API_RATE_LIMIT_PER_MINUTE: requisições por minuto por IP aceitas pela API do app.
 * @returns {number} padrão 300.
 * @throws {Error} se não for um inteiro positivo.
 */
function readApiRateLimit() {
  const value = Number(readOptional("API_RATE_LIMIT_PER_MINUTE", "300"));
  if (!Number.isInteger(value) || value < 1) throw new Error("API_RATE_LIMIT_PER_MINUTE precisa ser um inteiro positivo");
  return value;
}

/**
 * Lê e valida toda a configuração. Falha cedo se algo obrigatório faltar.
 * O backend não tem banco: serverUrl aponta para a API interna do servidor de gerenciamento.
 * @returns {Readonly<{nodeEnv: string, port: number, frontendOrigins: string[], serverUrl: string,
 *   serverServiceKey: string, contentVersionTtlMs: number, apiRateLimitPerMinute: number, jwtSecret: string, jwtExpiresIn: string, anthropicApiKey: string, aiModel: string}>}
 * Prefira getEnvironment(), que guarda o resultado.
 */
export function loadEnvironment() {
  return Object.freeze({
    nodeEnv: readOptional("NODE_ENV", "development"),
    port: Number(readOptional("PORT", "8080")),
    frontendOrigins: readFrontendOrigins(),
    serverUrl: readOptional("SERVER_URL", "http://127.0.0.1:8090/internal/v1").replace(/\/$/, ""),
    serverServiceKey: readServerServiceKey(),
    contentVersionTtlMs: readContentVersionTtl(),
    apiRateLimitPerMinute: readApiRateLimit(),
    jwtSecret: readJwtSecret(),
    jwtExpiresIn: readOptional("JWT_EXPIRES_IN", "7d"),
    anthropicApiKey: readOptional("ANTHROPIC_API_KEY", ""),
    aiModel: readOptional("AI_MODEL", "claude-opus-5-5"),
  });
}

let cachedEnvironment = null;

/**
 * Configuração validada, lida uma única vez (cache).
 * @returns {ReturnType<typeof loadEnvironment>}
 * Usado por: index.js, app.js, util-tokens.js, clients/server-client.js, clients/content-cache.js, service-chat.js, error-middleware.js.
 */
export function getEnvironment() {
  if (!cachedEnvironment) cachedEnvironment = loadEnvironment();
  return cachedEnvironment;
}

/**
 * @returns {boolean} true quando NODE_ENV=development (mostra detalhes extras de erro 500).
 * Usado por: error-middleware.js.
 */
export function isDevelopment() {
  return getEnvironment().nodeEnv === "development";
}
