/* Regras de pontuação e progressão (XP, aprovação) ficam no servidor de gerenciamento (server/src/config/rules.js). */

/**
 * Limites da lista do ranking (padrão e máximo de linhas). Usado por: controller-ranking.js.
 */
export const RANKING_RULES = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

/**
 * Regra de senha nova: tamanho mínimo (validado aqui e de novo no servidor, que faz o hash). Usado por: util-validators.js.
 */
export const PASSWORD_RULES = Object.freeze({
  MIN_LENGTH: 8,
});
