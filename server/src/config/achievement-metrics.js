/**
 * Métricas que uma conquista pode medir. Cada uma é calculada em readAchievementMetrics()
 * (services/service-achievement.js). O painel mostra esta lista (agrupada por "group") para o administrador
 * escolher; uma métrica nova exige código (o cálculo), mas metas, títulos e textos não.
 * @type {ReadonlyArray<{id: string, label: string, group: string}>}
 */
export const ACHIEVEMENT_METRICS = Object.freeze([
  { id: "streak", label: "Maior ofensiva (dias seguidos)", group: "Progresso" },
  { id: "completedModules", label: "Módulos concluídos", group: "Progresso" },
  { id: "totalCorrectAnswers", label: "Total de acertos", group: "Progresso" },
  { id: "completedActivities", label: "Atividades concluídas", group: "Progresso" },
  { id: "perfectActivities", label: "Atividades com 100% de acerto", group: "Progresso" },
  { id: "xp", label: "XP total", group: "Progresso" },
  { id: "dictionarySignsViewed", label: "Sinais diferentes abertos no dicionário", group: "Dicionário" },
  { id: "dictionaryPercent", label: "% do dicionário visto (meta 100 = ver todos os sinais)", group: "Dicionário" },
  { id: "tapLogo", label: "Toques na logo (topo da trilha)", group: "Toques em ícones" },
  { id: "tapFlame", label: "Toques no fogo da ofensiva", group: "Toques em ícones" },
  { id: "tapXp", label: "Toques no ícone de XP", group: "Toques em ícones" },
  { id: "assistantMessages", label: "Perguntas feitas ao assistente", group: "Uso do app" },
  { id: "cameraOpens", label: "Vezes que abriu o tradutor (câmera)", group: "Uso do app" },
  { id: "rankingOpens", label: "Vezes que abriu o ranking", group: "Uso do app" },
  { id: "themeChanges", label: "Trocas de tema (claro/escuro)", group: "Uso do app" },
]);

/**
 * Ações contadas que o app envia (POST /users/:id/events, {type, count}) → métrica que cada uma alimenta.
 * O total fica em user.actionCounts[type]. Para uma ação nova: acrescente aqui, em ACHIEVEMENT_METRICS e no app.
 */
export const APP_EVENT_METRICS = Object.freeze({
  tap_logo: "tapLogo",
  tap_flame: "tapFlame",
  tap_xp: "tapXp",
  assistant_message: "assistantMessages",
  camera_open: "cameraOpens",
  ranking_open: "rankingOpens",
  theme_change: "themeChanges",
});

/** Evento do dicionário: {type: "sign_view", sign: "<slug>"} (cada sinal conta uma vez, em user.viewedSigns). */
export const SIGN_VIEW_EVENT = "sign_view";
