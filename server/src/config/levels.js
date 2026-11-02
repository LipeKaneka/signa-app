/**
 * Tabela de níveis padrão: semente da coleção "levels" e reserva caso ela esteja vazia.
 * Cada nível começa em minXp de XP. Depois do seed, a tabela é editada pelo painel.
 * Usado por: service-level.js e seeds/seed-content.js.
 */
export const DEFAULT_LEVELS = Object.freeze([
  { level: 1, minXp: 0, title: "Iniciante" },
  { level: 2, minXp: 100, title: "Aprendiz" },
  { level: 3, minXp: 300, title: "Praticante" },
  { level: 4, minXp: 600, title: "Comunicador" },
  { level: 5, minXp: 1000, title: "Fluente" },
  { level: 6, minXp: 2000, title: "Mestre em Libras" },
]);
