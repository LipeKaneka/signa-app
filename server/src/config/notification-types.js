/**
 * Todas as notificações que o app pode receber. O painel (aba Notificações) liga/desliga cada tipo, troca o título
 * e o texto. Valores do painel ficam em NotificationTypeModel; o que estiver aqui é o padrão.
 * - variables: o que pode ir entre chaves no título/texto (ex.: "{achievement}"); o servidor troca pelo valor.
 * - audience: "user" (uma pessoa) ou "all" (todo mundo de uma vez).
 * - when: quando dispara (texto mostrado no painel).
 * Usado por: service-notification.js e a aba Notificações do painel.
 */
export const NOTIFICATION_TYPES = Object.freeze([
  {
    type: "achievement_unlocked",
    label: "Conquista desbloqueada",
    when: "Quando a pessoa desbloqueia uma conquista (atividade, acerto, ação no app ou dada pelo painel).",
    audience: "user",
    title: "Conquista desbloqueada!",
    body: "Você ganhou \"{achievement}\". Veja em Conquistas.",
    variables: { achievement: "nome da conquista" },
    link: "/conquistas",
  },
  {
    type: "level_up",
    label: "Subiu de nível",
    when: "Quando o XP da pessoa passa para um nível novo.",
    audience: "user",
    title: "Você subiu de nível!",
    body: "Agora você é nível {level}: {levelTitle}.",
    variables: { level: "número do nível", levelTitle: "nome do nível" },
    link: "/perfil",
  },
  {
    type: "xp_bonus",
    label: "XP de presente",
    when: "Quando o painel dá XP para a pessoa (Usuários → Somar XP).",
    audience: "user",
    title: "Você ganhou XP!",
    body: "+{xp} XP foram somados à sua conta.",
    variables: { xp: "quanto XP foi dado" },
    link: "/perfil",
  },
  {
    type: "streak_reminder",
    label: "Ofensiva em risco",
    when: "Todo dia às 19h (Brasília), para quem estudou ontem e ainda não estudou hoje.",
    audience: "user",
    title: "Sua ofensiva está em risco 🔥",
    body: "Faça uma atividade hoje para manter seus {streak} dias seguidos.",
    variables: { streak: "dias seguidos" },
    link: "/",
  },
  {
    type: "event_started",
    label: "Evento começou",
    when: "Quando um evento (ex.: 2x XP) começa, inclusive os que se repetem toda semana ou todo ano.",
    audience: "all",
    title: "{event} começou!",
    body: "{description}",
    variables: { event: "nome do evento", description: "descrição do evento", multiplier: "multiplicador de XP" },
    link: "/",
  },
  {
    type: "app_update",
    label: "Nova versão do app",
    when: "Quando o número da versão nova muda em Configurações → Atualização do app (ou \"Buscar no GitHub\").",
    audience: "all",
    title: "Nova versão do Signa",
    body: "A versão {version} chegou. Abra o app para atualizar.",
    variables: { version: "nome da versão" },
    link: "/",
  },
  {
    type: "account_restored",
    label: "Conta desbloqueada",
    when: "Quando o painel desbloqueia uma conta banida.",
    audience: "user",
    title: "Sua conta foi liberada",
    body: "Você já pode voltar a estudar no Signa.",
    variables: {},
    link: "/",
  },
  {
    type: "manual",
    label: "Aviso do painel",
    when: "Quando alguém do painel envia um aviso (para todos ou para uma pessoa). Título e texto são escritos na hora.",
    audience: "all",
    title: "",
    body: "",
    variables: {},
    link: "/notificacoes",
    manual: true,
  },
]);

export const NOTIFICATION_TYPE_KEYS = Object.freeze(NOTIFICATION_TYPES.map((item) => item.type));

/** Limites do título e do texto (cabem numa notificação do celular). */
export const NOTIFICATION_LIMITS = Object.freeze({ title: 80, body: 240 });

/** @param {string} type @returns {object|undefined} */
export function findNotificationType(type) {
  return NOTIFICATION_TYPES.find((item) => item.type === type);
}

/**
 * Troca "{nome}" pelos valores; chave sem valor some (fica vazia).
 * @param {string} template
 * @param {Record<string, unknown>} values
 * @returns {string}
 */
export function fillTemplate(template, values = {}) {
  return String(template ?? "")
    .replace(/\{(\w+)\}/g, (_match, key) => (values[key] === undefined || values[key] === null ? "" : String(values[key])))
    .replace(/\s{2,}/g, " ")
    .trim();
}
