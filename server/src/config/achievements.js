/**
 * Conquistas padrão: semente da coleção "achievements" e reserva caso ela esteja vazia.
 * Depois do seed, as conquistas são editadas no banco (painel); mudar este arquivo só afeta bancos novos.
 * Formato: {id, title, description, metric, goal} — no banco, "id" vira "key".
 * Métricas possíveis: config/achievement-metrics.js. Veja docs/CONQUISTAS.md.
 */
export const DEFAULT_ACHIEVEMENTS = Object.freeze([
  {
    id: "streak_7",
    title: "O que vem depois do 6?",
    description: "Obtenha uma ofensiva consecutiva de 7 dias.",
    metric: "streak",
    goal: 7,
  },
  {
    id: "first_module",
    title: "Já sou fluente?",
    description: "Conclua o primeiro módulo.",
    metric: "completedModules",
    goal: 1,
  },
  {
    id: "correct_50",
    title: "Imparável",
    description: "Acerte um total de 50 questões nas unidades.",
    metric: "totalCorrectAnswers",
    goal: 50,
  },
  {
    id: "first_activity",
    title: "Primeiros passos",
    description: "Conclua sua primeira atividade.",
    metric: "completedActivities",
    goal: 1,
  },
  {
    id: "xp_1000",
    title: "Mil pontos",
    description: "Alcance 1000 pontos de XP.",
    metric: "xp",
    goal: 1000,
  },
]);
