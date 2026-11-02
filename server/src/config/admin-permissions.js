import { ADMIN_ROLES } from "../models/model-admin.js";

/**
 * Papel mínimo para cada tipo de ação do painel. Os papéis são hierárquicos: owner > admin > editor > viewer
 * (quem pode mais também pode o que os de baixo podem).
 * - read: ver qualquer coisa (conteúdo, usuários, progresso, estatísticas).
 * - content: módulos, atividades/perguntas, dicionário, conquistas.
 * - manage: eventos, níveis, configurações, usuários do app, exportar conteúdo/rodar o seed, ver auditoria,
 *   exclusão definitiva de conteúdo.
 * - admins: contas do painel (criar, mudar papel, desativar, redefinir senha).
 * Tabela completa: docs/PAINEL-ADMIN.md.
 */
export const PERMISSIONS = Object.freeze({
  read: "viewer",
  content: "editor",
  manage: "admin",
  admins: "owner",
});

/**
 * Diz se um papel alcança o papel mínimo exigido.
 * @param {string} role - papel do administrador.
 * @param {string} minimumRole - um de ADMIN_ROLES.
 * @returns {boolean}
 * Usado por: requireRole (admin-auth-middleware.js) e GET /auth/me (o painel esconde o que o papel não pode).
 */
export function hasRole(role, minimumRole) {
  const rank = ADMIN_ROLES.indexOf(role);
  return rank !== -1 && rank <= ADMIN_ROLES.indexOf(minimumRole);
}

/**
 * Lista do que o papel pode fazer, para o painel montar o menu.
 * @param {string} role
 * @returns {Record<keyof typeof PERMISSIONS, boolean>}
 */
export function describePermissions(role) {
  return Object.fromEntries(Object.entries(PERMISSIONS).map(([action, minimum]) => [action, hasRole(role, minimum)]));
}
