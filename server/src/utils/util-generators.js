import { randomBytes } from "node:crypto";
import { slugify } from "./util-text.js";

/**
 * Gera o id público do usuário: apelido em slug + 6 caracteres aleatórios ("ana-souza_3f9a1c").
 * É o id que aparece na API (ranking, perfil); o _id do banco nunca sai.
 * @param {string} nickname
 * @returns {string}
 * Usado por: service-user.js (cadastro).
 */
export function generatePublicId(nickname) {
  const cleanNickname = slugify(nickname).slice(0, 24) || "user";
  return `${cleanNickname}_${randomBytes(3).toString("hex")}`;
}
