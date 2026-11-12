import { PROGRESS_RULES } from "./rules.js";
import { CORRECT_PHRASES, WRONG_PHRASES } from "./feedback-phrases.js";

/**
 * Configurações que podem ser alteradas pelo painel (coleção "settings").
 * - key: chave no banco. default: valor usado quando o banco não tem a chave (o comportamento de hoje).
 * - type: "integer" (min/max), "string" (maxLength), "text" (várias linhas, maxLength), "url" (só https) ou "phrases"
 *   (lista de {title, text}, até maxItems). allowEmpty: aceita texto vazio (campo opcional).
 * - validação ao salvar segue o type. public: vai para o app em GET /app-config.
 * - rule: nome da regra em PROGRESS_RULES que esta chave substitui (para getProgressRules()).
 * Para criar uma configuração nova: acrescente aqui e leia com getSetting(key).
 * Usado por: service-settings.js (e pelo painel, na Etapa 5, para montar o formulário).
 */
export const SETTING_DEFINITIONS = Object.freeze([
  {
    key: "progress.xpPerCorrectAnswer",
    label: "XP por acerto (primeira aprovação)",
    type: "integer",
    min: 0,
    max: 1000,
    default: PROGRESS_RULES.XP_PER_CORRECT_ANSWER,
    rule: "XP_PER_CORRECT_ANSWER",
  },
  {
    key: "progress.replayXpPerCorrectAnswer",
    label: "XP por acerto ao refazer atividade aprovada",
    type: "integer",
    min: 0,
    max: 1000,
    default: PROGRESS_RULES.REPLAY_XP_PER_CORRECT_ANSWER,
    rule: "REPLAY_XP_PER_CORRECT_ANSWER",
  },
  {
    key: "progress.perfectActivityBonusXp",
    label: "Bônus de XP por atividade perfeita",
    type: "integer",
    min: 0,
    max: 1000,
    default: PROGRESS_RULES.PERFECT_ACTIVITY_BONUS_XP,
    rule: "PERFECT_ACTIVITY_BONUS_XP",
  },
  {
    key: "progress.minScoreToPass",
    label: "Nota mínima para aprovar (%)",
    type: "integer",
    min: 0,
    max: 100,
    default: PROGRESS_RULES.MIN_SCORE_TO_PASS,
    rule: "MIN_SCORE_TO_PASS",
    public: true,
  },
  {
    key: "progress.attemptExpirationMinutes",
    label: "Tempo para terminar uma atividade (minutos)",
    type: "integer",
    min: 5,
    max: 1440,
    default: PROGRESS_RULES.ATTEMPT_EXPIRATION_MINUTES,
    rule: "ATTEMPT_EXPIRATION_MINUTES",
  },
  {
    key: "app.feedback.correctPhrases",
    label: "Frases de acerto (sorteadas a cada resposta certa)",
    type: "phrases",
    maxItems: 40,
    default: CORRECT_PHRASES,
    public: true,
  },
  {
    key: "app.feedback.wrongPhrases",
    label: "Frases de erro (sorteadas a cada resposta errada)",
    type: "phrases",
    maxItems: 40,
    default: WRONG_PHRASES,
    public: true,
  },
  // Atualização do APK: o app compara o próprio versionCode (android/app/build.gradle) com estes números.
  {
    key: "app.update.latestVersionCode",
    label: "Número da versão nova (versionCode do APK; 0 = não avisar)",
    type: "integer",
    min: 0,
    max: 2100000000,
    default: 0,
    public: true,
  },
  {
    key: "app.update.minVersionCode",
    label: "Número mínimo exigido (abaixo dele, a atualização é obrigatória; 0 = nunca obrigar)",
    type: "integer",
    min: 0,
    max: 2100000000,
    default: 0,
    public: true,
  },
  {
    key: "app.update.versionName",
    label: "Nome da versão nova (ex.: 1.2)",
    type: "string",
    maxLength: 30,
    allowEmpty: true,
    default: "",
    public: true,
  },
  {
    key: "app.update.downloadUrl",
    label: "Link para baixar o APK novo (https; do Google Drive pode colar o link de compartilhar, com acesso \"qualquer pessoa com o link\")",
    type: "url",
    maxLength: 500,
    allowEmpty: true,
    default: "",
    public: true,
  },
  {
    key: "app.update.githubRepo",
    label: "Repositório do GitHub com as releases (dono/nome; usado pelo botão \"Buscar no GitHub\")",
    type: "string",
    maxLength: 100,
    allowEmpty: true,
    default: "LipeKaneka/signa-app",
    public: false,
  },
  {
    key: "app.update.notes",
    label: "Novidades da versão (aparecem na tela de atualização)",
    type: "text",
    maxLength: 600,
    allowEmpty: true,
    default: "",
    public: true,
  },
]);
