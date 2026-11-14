import { createSign } from "node:crypto";

/**
 * Notificação no celular (app fechado) pelo Firebase Cloud Messaging (API HTTP v1), sem biblioteca extra.
 * Liga com a variável FIREBASE_SERVICE_ACCOUNT: o JSON da conta de serviço do Firebase (Configurações do projeto →
 * Contas de serviço → Gerar nova chave privada), colado inteiro ou em base64. Sem ela, nada vai para o celular
 * (as notificações dentro do app continuam funcionando).
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const REQUEST_TIMEOUT_MS = 10 * 1000;

let account;
let accessToken = { value: null, expiresAt: 0 };

/** Conta de serviço lida do ambiente (uma vez), ou null. */
function readServiceAccount() {
  if (account !== undefined) return account;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  account = null;
  if (!raw) return account;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    if (json.client_email && json.private_key && json.project_id) account = json;
    else console.error("FIREBASE_SERVICE_ACCOUNT sem client_email, private_key ou project_id: push desligado.");
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT não é um JSON válido: push desligado.");
  }
  return account;
}

/** @returns {boolean} true se o push para o celular está configurado. */
export function isPushConfigured() {
  return Boolean(readServiceAccount());
}

const base64url = (value) => Buffer.from(value).toString("base64url");

/** Token de acesso do Google (JWT assinado com a chave da conta de serviço), guardado até perto de vencer. */
async function getAccessToken() {
  if (accessToken.value && Date.now() < accessToken.expiresAt - 60_000) return accessToken.value;
  const { client_email: email, private_key: key } = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google recusou o token (${response.status})`);
  const data = await response.json();
  accessToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return accessToken.value;
}

/**
 * Envia a notificação para os aparelhos da pessoa.
 * @param {string[]} tokens - tokens do FCM registrados pelo app.
 * @param {{title: string, body: string, link?: string, id?: string}} message
 * @returns {Promise<string[]>} tokens que não valem mais (app desinstalado): quem chama deve apagá-los.
 * Nunca lança: falha de push só vai para o log.
 */
export async function sendPush(tokens, { title, body, link = "/notificacoes", id = "" }) {
  if (!tokens.length || !isPushConfigured()) return [];
  const invalid = [];
  try {
    const bearer = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${readServiceAccount().project_id}/messages:send`;
    await Promise.all(tokens.map(async (token) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: { link, id },
            android: { priority: "high", notification: { channel_id: "avisos" } },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return;
      const detail = await response.text().catch(() => "");
      if (response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(detail)) invalid.push(token);
      else console.error(`Push recusado (${response.status}):`, detail.slice(0, 200));
    }));
  } catch (error) {
    console.error("Push para o celular falhou:", error.message);
  }
  return invalid;
}

/** Só para testes: esquece a conta e o token lidos. */
export function resetPushForTests() {
  account = undefined;
  accessToken = { value: null, expiresAt: 0 };
}
