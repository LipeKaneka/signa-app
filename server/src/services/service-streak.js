/**
 * Ofensiva (dias seguidos com atividade concluída). Os dias são contados no fuso de
 * Brasília, para que "hoje" vire à meia-noite do aluno e não à meia-noite UTC.
 */
const STREAK_TIME_ZONE = "America/Sao_Paulo";

/**
 * Data no formato "AAAA-MM-DD" no fuso de Brasília (o dia vira à meia-noite do aluno).
 * @param {Date} date
 * @returns {string}
 * Usado por: registerActivityDay, readCurrentStreak, service-ranking.js (filtro de ofensiva).
 */
export function toDayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STREAK_TIME_ZONE }).format(date);
}

/**
 * Dia anterior a "date", no mesmo formato de toDayKey.
 * @param {Date} date
 * @returns {string}
 */
function previousDayKey(date) {
  return toDayKey(new Date(date.getTime() - 24 * 60 * 60 * 1000));
}

/**
 * Marca que o usuário estudou hoje: soma 1 à ofensiva se estudou ontem, senão recomeça em 1.
 * Atualiza streak, maxStreak e lastActivityDay NO OBJETO (não salva no banco).
 * @param {object} user - documento do usuário.
 * @param {Date} [now]
 * @returns {void}
 * Usado por: service-attempt.js (finishAttempt).
 */
export function registerActivityDay(user, now = new Date()) {
  const today = toDayKey(now);
  if (user.lastActivityDay === today) return;

  user.streak = user.lastActivityDay === previousDayKey(now) ? user.streak + 1 : 1;
  user.maxStreak = Math.max(user.maxStreak, user.streak);
  user.lastActivityDay = today;
}

/**
 * Ofensiva válida agora: se o último dia de estudo não foi hoje nem ontem, vale 0.
 * @param {object} user
 * @param {Date} [now]
 * @returns {number}
 * Usado por: perfil (toPublicProfile), conquistas (readAchievementMetrics).
 */
export function readCurrentStreak(user, now = new Date()) {
  const isAlive = user.lastActivityDay === toDayKey(now) || user.lastActivityDay === previousDayKey(now);
  return isAlive ? user.streak : 0;
}
