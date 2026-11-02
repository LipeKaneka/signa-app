/**
 * Regras de pontuação e progressão. Aplicadas só no servidor (o app nunca calcula XP).
 * - XP_PER_CORRECT_ANSWER: XP por acerto na primeira aprovação da atividade.
 * - REPLAY_XP_PER_CORRECT_ANSWER: XP por acerto ao refazer atividade já aprovada (evita "farm").
 * - PERFECT_ACTIVITY_BONUS_XP: bônus por 100% na primeira aprovação.
 * - MIN_SCORE_TO_PASS: nota mínima (%) para aprovar e liberar a próxima atividade.
 * - ATTEMPT_EXPIRATION_MINUTES: tempo para terminar uma tentativa.
 * São os PADRÕES: cada regra pode ser trocada no banco (config/setting-definitions.js); leia sempre com
 * getProgressRules() (service-settings.js), nunca direto daqui. Eventos de 2x XP ficam na coleção "events".
 */
export const PROGRESS_RULES = Object.freeze({
  XP_PER_CORRECT_ANSWER: 10,
  /** Refazer uma atividade já aprovada vale menos, para o ranking de XP não virar "farm". */
  REPLAY_XP_PER_CORRECT_ANSWER: 2,
  PERFECT_ACTIVITY_BONUS_XP: 10,
  MIN_SCORE_TO_PASS: 70,
  ATTEMPT_EXPIRATION_MINUTES: 120,
});

/**
 * Limites da lista do ranking (padrão e máximo de linhas). Usado por: controller-ranking.js.
 */
export const RANKING_RULES = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

/**
 * Regras de senha: tamanho mínimo e custo do bcrypt. Usado por: util-validators.js, service-user.js.
 */
export const PASSWORD_RULES = Object.freeze({
  MIN_LENGTH: 8,
  BCRYPT_ROUNDS: 12,
});
