import { AdminModel, ADMIN_ROLES } from "../models/model-admin.js";
import { badRequest, conflict, notFound } from "../utils/util-http-error.js";
import { toPublicAdmin, hashAdminPassword, endAllAdminSessions } from "./service-admin-auth.js";
import { recordAudit } from "./service-audit.js";

/**
 * Confere se o papel existe.
 * @param {unknown} role
 * @returns {string}
 * @throws {HttpError} 400 se não for um de ADMIN_ROLES.
 */
export function readRole(role) {
  if (!ADMIN_ROLES.includes(role)) throw badRequest(`Papel inválido. Use: ${ADMIN_ROLES.join(", ")}.`);
  return role;
}

/**
 * Todas as contas do painel (owner vê e gerencia).
 * @returns {Promise<object[]>}
 * Usado por: GET /admin/api/v1/admins.
 */
export async function listAdmins() {
  const admins = await AdminModel.find().sort({ createdAt: 1 }).lean();
  return admins.map(toPublicAdmin);
}

/**
 * Cria uma conta do painel.
 * @param {{admin: object|null, ip: string|null}} actor - null no comando do primeiro owner.
 * @param {{email: string, name: string, role: string, password: string}} data - já validado.
 * @returns {Promise<object>} conta pública.
 * @throws {HttpError} 409 se o e-mail já existir.
 * Usado por: POST /admin/api/v1/admins e scripts/create-owner.js.
 */
export async function createAdmin(actor, { email, name, role, password }) {
  if (await AdminModel.exists({ email })) throw conflict("Já existe uma conta do painel com este e-mail.");
  const admin = await AdminModel.create({ email, name, role: readRole(role), passwordHash: await hashAdminPassword(password) });
  await recordAudit(actor, { action: "create", entity: "admin", entityId: admin._id, summary: `Conta ${email} (${role})`, after: admin });
  return toPublicAdmin(admin);
}

/**
 * Garante que a mudança não deixa o painel sem nenhum owner ativo.
 * @param {object} target - conta que vai mudar.
 * @param {{role?: string, status?: string}} changes
 * @throws {HttpError} 400 se o último owner ativo deixaria de ser owner ou seria desativado.
 */
async function keepAnActiveOwner(target, changes) {
  const stopsBeingActiveOwner =
    target.role === "owner" && target.status === "active" &&
    ((changes.role !== undefined && changes.role !== "owner") || changes.status === "disabled");
  if (!stopsBeingActiveOwner) return;
  const activeOwners = await AdminModel.countDocuments({ role: "owner", status: "active" });
  if (activeOwners <= 1) throw badRequest("O painel precisa de pelo menos um owner ativo.");
}

/**
 * Muda nome, papel ou status de uma conta. Ninguém muda o próprio papel ou status (evita se trancar fora).
 * Mudar papel ou desativar derruba as sessões da conta (vale na hora).
 * @param {{admin: object, ip: string|null}} actor
 * @param {string} adminId
 * @param {{name?: string, role?: string, status?: string}} changes - já validado.
 * @returns {Promise<object>} conta pública.
 * @throws {HttpError} 404, 400.
 * Usado por: PATCH /admin/api/v1/admins/:id.
 */
export async function updateAdmin(actor, adminId, changes) {
  const target = await AdminModel.findById(adminId);
  if (!target) throw notFound("Conta do painel não encontrada.");
  const isSelf = String(target._id) === String(actor.admin._id);
  if (isSelf && (changes.role !== undefined || changes.status !== undefined)) {
    throw badRequest("Você não pode mudar o seu próprio papel ou status.");
  }
  if (changes.role !== undefined) readRole(changes.role);
  if (changes.status !== undefined && !["active", "disabled"].includes(changes.status)) throw badRequest("Status inválido.");
  await keepAnActiveOwner(target, changes);

  const before = target.toObject();
  if (changes.name !== undefined) target.name = changes.name;
  if (changes.role !== undefined) target.role = changes.role;
  if (changes.status !== undefined) target.status = changes.status;
  await target.save();
  if (changes.role !== undefined || changes.status === "disabled") await endAllAdminSessions(target._id);

  const action = changes.status === "disabled" ? "deactivate" : changes.status === "active" && before.status !== "active" ? "activate" : "update";
  await recordAudit(actor, { action, entity: "admin", entityId: target._id, summary: `Conta ${target.email}`, before, after: target });
  return toPublicAdmin(target);
}

/**
 * Define uma senha nova para outra conta (ex.: esqueceu a senha) e derruba as sessões dela.
 * @param {{admin: object, ip: string|null}} actor
 * @param {string} adminId
 * @param {string} password - já validada.
 * @returns {Promise<void>}
 * Usado por: POST /admin/api/v1/admins/:id/password.
 */
export async function resetAdminPassword(actor, adminId, password) {
  const target = await AdminModel.findById(adminId);
  if (!target) throw notFound("Conta do painel não encontrada.");
  target.passwordHash = await hashAdminPassword(password);
  await target.save();
  await endAllAdminSessions(target._id);
  await recordAudit(actor, { action: "reset_password", entity: "admin", entityId: target._id, summary: `Senha redefinida de ${target.email}` });
}
