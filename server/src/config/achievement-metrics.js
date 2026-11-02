/**
 * Métricas que uma conquista pode medir. Cada uma é calculada em readAchievementMetrics()
 * (services/service-achievement.js). O painel mostra esta lista para o administrador escolher;
 * uma métrica nova exige código (o cálculo), mas metas, títulos e textos não.
 * @type {ReadonlyArray<{id: string, label: string}>}
 */
export const ACHIEVEMENT_METRICS = Object.freeze([
  { id: "streak", label: "Maior ofensiva (dias seguidos)" },
  { id: "completedModules", label: "Módulos concluídos" },
  { id: "totalCorrectAnswers", label: "Total de acertos" },
  { id: "completedActivities", label: "Atividades concluídas" },
  { id: "xp", label: "XP total" },
]);
