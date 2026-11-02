import * as AccountsService from "../../services/service-admin-accounts.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readEmail, readRequiredString, readOptionalString, readAdminPassword } from "../../utils/util-validators.js";

/** GET /admin/api/v1/admins — {admins}. Só owner. */
export async function list(_req, res) {
  res.json({ admins: await AccountsService.listAdmins() });
}

/** POST /admin/api/v1/admins — {email, name, role, password} → 201 {admin}. */
export async function create(req, res) {
  const admin = await AccountsService.createAdmin(readActor(req), {
    email: readEmail(req.body?.email),
    name: readRequiredString(req.body?.name, "o nome", 80),
    role: AccountsService.readRole(req.body?.role),
    password: readAdminPassword(req.body?.password),
  });
  res.status(201).json({ admin });
}

/** PATCH /admin/api/v1/admins/:id — {name?, role?, status?} → {admin}. */
export async function update(req, res) {
  const admin = await AccountsService.updateAdmin(readActor(req), req.params.id, {
    name: readOptionalString(req.body?.name, "Nome", 80) || undefined,
    role: req.body?.role,
    status: req.body?.status,
  });
  res.json({ admin });
}

/** POST /admin/api/v1/admins/:id/password — {password}: define uma senha nova para outra conta. */
export async function resetPassword(req, res) {
  await AccountsService.resetAdminPassword(readActor(req), req.params.id, readAdminPassword(req.body?.password));
  res.json({ ok: true });
}
