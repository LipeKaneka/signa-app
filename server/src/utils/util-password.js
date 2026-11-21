import { hash, verify } from "@node-rs/bcrypt";
import { PASSWORD_RULES } from "../config/rules.js";

/**
 * Hash e conferência de senhas (bcrypt nativo, @node-rs/bcrypt). Roda numa thread separada: um login não trava os
 * outros pedidos enquanto calcula (o bcryptjs, em JavaScript puro, usava a thread principal). Os hashes antigos
 * ($2a$/$2b$, gerados pelo bcryptjs) continuam valendo, e os novos ($2y$) também seriam aceitos pelo bcryptjs.
 * Usado por: service-user, service-password-reset e service-admin-auth.
 */

/** @param {string} password @returns {Promise<string>} hash bcrypt com o custo de PASSWORD_RULES.BCRYPT_ROUNDS. */
export function hashPassword(password) {
  return hash(password, PASSWORD_RULES.BCRYPT_ROUNDS);
}

/** @param {string} password @param {string} passwordHash @returns {Promise<boolean>} */
export async function verifyPassword(password, passwordHash) {
  if (typeof password !== "string" || typeof passwordHash !== "string" || !passwordHash) return false;
  try {
    return await verify(password, passwordHash);
  } catch {
    return false; // hash em formato inesperado: trata como senha errada
  }
}
