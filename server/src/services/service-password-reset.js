import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/model-user.js";
import { PASSWORD_RULES } from "../config/rules.js";
import { badRequest, HttpError } from "../utils/util-http-error.js";
import { sendPasswordResetCode } from "./service-mailer.js";
import { readActiveBan } from "./service-user.js";

/** Validade do código, tentativas erradas permitidas e intervalo mínimo entre envios. */
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_INTERVAL_MS = 60 * 1000;
const INVALID_CODE_MESSAGE = "Código inválido ou vencido. Peça um novo código.";

/**
 * Hash do código (o banco nunca guarda o código em si). O e-mail entra no hash para o mesmo código
 * não servir para outra conta.
 * @param {string} email
 * @param {string} code
 * @returns {string}
 */
function hashCode(email, code) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

/**
 * Pede um código de recuperação. A resposta é sempre a mesma, exista ou não a conta (não revela quem tem
 * cadastro). Contas bloqueadas não recebem código.
 * @param {string} email - já validado.
 * @returns {Promise<void>}
 * @throws {HttpError} 429 se pedir de novo antes de 1 minuto.
 * Usado por: POST /internal/v1/auth/password-reset/request.
 */
export async function requestPasswordReset(email) {
  const user = await UserModel.findOne({ email }).select("+passwordReset");
  if (!user || readActiveBan(user)) return;
  const now = Date.now();
  if (user.passwordReset?.sentAt && now - user.passwordReset.sentAt.getTime() < RESEND_INTERVAL_MS) {
    throw new HttpError(429, "Espere um minuto para pedir outro código.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  user.passwordReset = { codeHash: hashCode(email, code), expiresAt: new Date(now + CODE_TTL_MS), attempts: 0, sentAt: new Date(now) };
  await user.save();
  try {
    await sendPasswordResetCode(email, code);
  } catch (error) {
    // E-mail não saiu: o código não vale e a pessoa pode pedir de novo na hora.
    user.passwordReset = null;
    await user.save();
    throw error;
  }
}

/**
 * Confere o código; cada erro conta uma tentativa e, ao passar do limite, o código deixa de valer.
 * @param {string} email
 * @param {string} code
 * @returns {Promise<object>} usuário (com passwordReset).
 * @throws {HttpError} 400 se inválido, vencido ou com tentativas esgotadas.
 */
async function checkCode(email, code) {
  const user = await UserModel.findOne({ email }).select("+passwordReset +passwordHash");
  const reset = user?.passwordReset;
  if (!user || readActiveBan(user) || !reset?.codeHash || reset.expiresAt.getTime() < Date.now() || reset.attempts >= MAX_ATTEMPTS) {
    throw badRequest(INVALID_CODE_MESSAGE);
  }
  if (reset.codeHash !== hashCode(email, code)) {
    user.passwordReset.attempts = reset.attempts + 1;
    await user.save();
    throw badRequest(reset.attempts + 1 >= MAX_ATTEMPTS ? INVALID_CODE_MESSAGE : "Código incorreto. Confira o e-mail e tente de novo.");
  }
  return user;
}

/**
 * Só confere o código (tela "Insira o código"), sem gastá-lo.
 * @param {string} email
 * @param {string} code - 6 dígitos.
 * @returns {Promise<void>}
 * Usado por: POST /internal/v1/auth/password-reset/verify.
 */
export async function verifyPasswordResetCode(email, code) {
  await checkCode(email, code);
}

/**
 * Troca a senha com o código (que é gasto). A pessoa entra em seguida com a senha nova.
 * @param {string} email
 * @param {string} code
 * @param {string} password - nova senha já validada.
 * @returns {Promise<void>}
 * Usado por: POST /internal/v1/auth/password-reset/confirm.
 */
export async function confirmPasswordReset(email, code, password) {
  const user = await checkCode(email, code);
  user.passwordHash = await bcrypt.hash(password, PASSWORD_RULES.BCRYPT_ROUNDS);
  user.passwordReset = null;
  await user.save();
}
