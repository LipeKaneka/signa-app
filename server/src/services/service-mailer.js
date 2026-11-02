import { isDevelopment } from "../config/env.js";

/**
 * Envio de mensagens ao usuário (hoje só o código de recuperação de senha).
 * AINDA NÃO HÁ SERVIÇO DE E-MAIL configurado: em desenvolvimento o código aparece no log do servidor
 * (.claude/dev-servers/server.log); em produção nada é enviado e um aviso vai para o log.
 * Para enviar de verdade, troque o corpo desta função por um provedor de e-mail (SMTP, SES, etc.).
 * @param {string} email
 * @param {string} code - 6 dígitos.
 * @returns {Promise<void>}
 * Usado por: service-password-reset.js.
 */
export async function sendPasswordResetCode(email, code) {
  if (isDevelopment()) {
    console.log(`[desenvolvimento] Código de recuperação de senha para ${email}: ${code}`);
    return;
  }
  console.warn(`Recuperação de senha pedida para ${email}, mas nenhum serviço de e-mail está configurado.`);
}
