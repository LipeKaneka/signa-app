import { OAuth2Client } from "google-auth-library";
import { getEnvironment } from "../config/env.js";
import { badRequest, unauthorized } from "../utils/util-http-error.js";

let client = null;
let verifyOverride = null;

/**
 * Confere o "ID token" que o app recebeu do Google: assinatura do Google, validade e se foi emitido para o
 * nosso app (audience = GOOGLE_CLIENT_IDS). Só aceita e-mail confirmado pelo Google.
 * @param {string} idToken
 * @returns {Promise<{googleId: string, email: string, name: string}>}
 * @throws {HttpError} 400 se o login com Google estiver desligado; 401 se o token não valer.
 * Usado por: service-user.signInWithGoogle.
 */
export async function verifyGoogleIdToken(idToken) {
  const { googleClientIds } = getEnvironment();
  if (googleClientIds.length === 0) throw badRequest("Entrar com o Google ainda não está disponível. Use e-mail e senha.");

  let payload;
  try {
    if (verifyOverride) {
      payload = await verifyOverride(idToken, googleClientIds);
    } else {
      client ??= new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken, audience: [...googleClientIds] });
      payload = ticket.getPayload();
    }
  } catch {
    throw unauthorized("Não foi possível confirmar sua conta Google. Tente de novo.");
  }
  if (!payload?.sub || !payload.email) throw unauthorized("Não foi possível confirmar sua conta Google. Tente de novo.");
  if (payload.email_verified !== true) throw unauthorized("O e-mail desta conta Google não está confirmado.");

  const email = payload.email.toLowerCase();
  return { googleId: String(payload.sub), email, name: String(payload.name || payload.given_name || email.split("@")[0]) };
}

/**
 * SÓ PARA TESTES: troca a conferência do Google por uma função (o token de verdade só o Google emite).
 * @param {((idToken: string, audiences: string[]) => Promise<object>)|null} fn - null volta ao normal.
 */
export function setGoogleVerifierForTests(fn) {
  if (getEnvironment().nodeEnv !== "test") throw new Error("setGoogleVerifierForTests só existe nos testes");
  verifyOverride = fn;
}
