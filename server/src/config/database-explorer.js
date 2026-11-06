import { UserModel } from "../models/model-user.js";
import { SignModel } from "../models/model-sign.js";
import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";
import { AttemptModel } from "../models/model-attempt.js";
import { AchievementModel } from "../models/model-achievement.js";
import { EventModel } from "../models/model-event.js";
import { LevelModel } from "../models/model-level.js";
import { SettingModel } from "../models/model-setting.js";
import { AuditLogModel } from "../models/model-audit-log.js";
import { AdminModel } from "../models/model-admin.js";
import { AdminSessionModel } from "../models/model-admin-session.js";

/** Campos que nunca são editáveis em nenhuma coleção. */
export const ALWAYS_READONLY = Object.freeze(["_id", "__v", "createdAt", "updatedAt"]);

/**
 * Coleções que o explorador de banco do painel (só owner) mostra e o que cada uma permite.
 * - hidden: campos que NUNCA saem do servidor (hash de senha, códigos, tokens) nem podem ser escritos.
 * - readonly: campos visíveis mas não editáveis aqui (além de ALWAYS_READONLY).
 * - editable/creatable/deletable: o que a tela permite. Conteúdo com regras próprias (trilha, configurações,
 *   contas do painel) fica só leitura aqui: muda pelas páginas dele, que validam tudo.
 * - content: alterar sobe a versão do conteúdo e limpa os caches (o app vê na hora).
 * - search: campos de texto usados na busca; columns: o que a tabela mostra; sort: ordem padrão.
 * Toda escrita passa pelas validações do modelo (Mongoose) e entra na auditoria.
 */
export const EXPLORER_COLLECTIONS = Object.freeze({
  users: {
    label: "Usuários do app",
    model: UserModel,
    hidden: ["passwordHash", "passwordReset", "avatar", "avatarThumb"],
    readonly: ["publicId", "googleId", "completedActivities", "completedActivitiesCount", "rankingPositions"],
    editable: true,
    creatable: false,
    deletable: true,
    search: ["nickname", "email", "publicId", "city"],
    columns: ["nickname", "email", "xp", "status", "createdAt"],
    sort: { createdAt: -1 },
  },
  signs: {
    label: "Sinais (dicionário)",
    model: SignModel,
    editable: true,
    creatable: true,
    deletable: true,
    content: true,
    search: ["word", "slug", "category", "vlibrasGloss"],
    columns: ["word", "category", "vlibrasGloss", "glossReviewed", "active"],
    sort: { word: 1 },
  },
  modules: {
    label: "Módulos",
    model: ModuleModel,
    readonly: ["prerequisite"],
    editable: true,
    creatable: false,
    deletable: false,
    content: true,
    search: ["title", "slug"],
    columns: ["order", "title", "slug", "active"],
    sort: { order: 1 },
  },
  activities: {
    label: "Atividades",
    model: ActivityModel,
    readonly: ["module"],
    editable: true,
    creatable: false,
    deletable: false,
    content: true,
    search: ["title", "description"],
    columns: ["title", "order", "module", "active"],
    sort: { module: 1, order: 1 },
  },
  attempts: {
    label: "Tentativas",
    model: AttemptModel,
    editable: false,
    creatable: false,
    deletable: true,
    search: ["status"],
    columns: ["status", "user", "activity", "finishedAt", "createdAt"],
    sort: { createdAt: -1 },
  },
  achievements: {
    label: "Conquistas",
    model: AchievementModel,
    editable: true,
    creatable: true,
    deletable: true,
    content: true,
    search: ["key", "title", "metric"],
    columns: ["order", "title", "metric", "goal", "active"],
    sort: { order: 1 },
  },
  events: {
    label: "Eventos de XP",
    model: EventModel,
    editable: true,
    creatable: true,
    deletable: true,
    content: true,
    search: ["title", "type"],
    columns: ["title", "multiplier", "startsAt", "endsAt", "active"],
    sort: { startsAt: -1 },
  },
  levels: {
    label: "Níveis",
    model: LevelModel,
    editable: true,
    creatable: true,
    deletable: true,
    content: true,
    search: ["title"],
    columns: ["level", "minXp", "title"],
    sort: { level: 1 },
  },
  settings: {
    label: "Configurações",
    model: SettingModel,
    editable: false,
    creatable: false,
    deletable: false,
    search: ["key"],
    columns: ["key", "value", "updatedAt"],
    sort: { key: 1 },
    note: "Só leitura aqui: edite pela página Configurações, que valida cada valor.",
  },
  auditLogs: {
    label: "Auditoria",
    model: AuditLogModel,
    editable: false,
    creatable: false,
    deletable: false,
    search: ["adminEmail", "action", "entity", "summary"],
    columns: ["createdAt", "adminEmail", "action", "entity", "summary"],
    sort: { createdAt: -1 },
    note: "Só leitura: o histórico não pode ser alterado nem apagado.",
  },
  admins: {
    label: "Contas do painel",
    model: AdminModel,
    hidden: ["passwordHash"],
    editable: false,
    creatable: false,
    deletable: false,
    search: ["name", "email", "role"],
    columns: ["name", "email", "role", "status"],
    sort: { createdAt: 1 },
    note: "Só leitura aqui: gerencie pela página Administradores.",
  },
  adminSessions: {
    label: "Sessões do painel",
    model: AdminSessionModel,
    hidden: ["tokenHash"],
    editable: false,
    creatable: false,
    deletable: false,
    search: [],
    columns: ["admin", "createdAt", "expiresAt"],
    sort: { createdAt: -1 },
    note: "Só leitura: para encerrar sessões, desative ou redefina a senha da conta.",
  },
});
