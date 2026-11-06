import { getEnvironment, isDevelopment } from "../config/env.js";
import { HttpError } from "../utils/util-http-error.js";

/** Envio pela API do Mailtrap (Email Sending); com MAILTRAP_INBOX_ID, vai para a caixa de testes (Sandbox). */
const MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send";
const MAILTRAP_SANDBOX_URL = "https://sandbox.api.mailtrap.io/api/send";
const SEND_TIMEOUT_MS = 10_000;
const MAIL_FAILED_MESSAGE = "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.";

/**
 * Corpo do e-mail com o código (texto puro + HTML simples, nas cores do app).
 * @param {string} code
 * @returns {{subject: string, text: string, html: string}}
 */
function buildPasswordResetMessage(code) {
  const subject = "Seu código para trocar a senha do Signa Ludus";
  const text = [
    "Olá!",
    "",
    `Seu código para criar uma nova senha no Signa Ludus é: ${code}`,
    "Ele vale por 15 minutos.",
    "",
    "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f3f0ff;font-family:Arial,Helvetica,sans-serif;color:#111111">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px">
    <tr><td style="padding:28px 28px 8px">
      <p style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#4f31bb">Signa Ludus</p>
      <p style="margin:0 0 20px;font-size:15px">Use este código no app para criar uma nova senha:</p>
      <p style="margin:0 0 20px;padding:16px;border-radius:12px;background:#ede8ff;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#3f2c88">${code}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#555555">O código vale por 15 minutos.</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555555">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

/**
 * Envia um e-mail pela API do Mailtrap.
 * @param {{to: string, subject: string, text: string, html: string, category: string}} message
 * @returns {Promise<void>}
 * @throws {HttpError} 503 se o Mailtrap recusar ou não responder (detalhe só no log, nunca o token).
 */
async function sendWithMailtrap({ to, subject, text, html, category }) {
  const { mail } = getEnvironment();
  const url = mail.mailtrapInboxId ? `${MAILTRAP_SANDBOX_URL}/${encodeURIComponent(mail.mailtrapInboxId)}` : MAILTRAP_SEND_URL;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${mail.mailtrapToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: { email: mail.fromEmail, name: mail.fromName }, to: [{ email: to }], subject, text, html, category }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Mailtrap inacessível:", error.message);
    throw new HttpError(503, MAIL_FAILED_MESSAGE, { code: "mail_failed" });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`Mailtrap recusou o envio (${response.status}):`, detail.slice(0, 300));
    throw new HttpError(503, MAIL_FAILED_MESSAGE, { code: "mail_failed" });
  }
}

/**
 * Envia o código de recuperação de senha.
 * - Com MAILTRAP_API_TOKEN: envia pela API do Mailtrap.
 * - Sem token, em desenvolvimento: o código aparece no log do servidor.
 * - Sem token, em produção: nada é enviado (aviso no log).
 * @param {string} email
 * @param {string} code - 6 dígitos.
 * @returns {Promise<void>}
 * @throws {HttpError} 503 se o envio falhar.
 * Usado por: service-password-reset.js.
 */
export async function sendPasswordResetCode(email, code) {
  if (getEnvironment().mail.mailtrapToken) {
    await sendWithMailtrap({ to: email, ...buildPasswordResetMessage(code), category: "password-reset" });
    return;
  }
  if (isDevelopment()) {
    console.log(`[desenvolvimento] Código de recuperação de senha para ${email}: ${code}`);
    return;
  }
  console.warn(`Recuperação de senha pedida para ${email}, mas MAILTRAP_API_TOKEN não está configurado.`);
}
