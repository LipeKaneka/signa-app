import { readStats, exportContent } from "../../services/service-admin-overview.js";
import { readAnalytics } from "../../services/service-admin-analytics.js";
import { listAuditLogs, recordAudit } from "../../services/service-audit.js";
import { seedContent } from "../../seeds/seed-content.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readOptionalString, readPositiveInteger } from "../../utils/util-validators.js";

/** GET /admin/api/v1/stats — números da tela inicial. */
export async function stats(_req, res) {
  res.json(await readStats());
}

/** GET /admin/api/v1/analytics?days=7|30|90 — dados do dashboard (indicadores, série diária, rankings, funil). */
export async function analytics(req, res) {
  res.json(await readAnalytics({ days: Number(req.query.days) || 30 }));
}

/** GET /admin/api/v1/audit-log?entity=&adminEmail=&page=&limit= — {logs, total, page, pages}. */
export async function auditLog(req, res) {
  res.json(
    await listAuditLogs({
      entity: readOptionalString(req.query.entity, "Tipo", 40),
      adminEmail: readOptionalString(req.query.adminEmail, "E-mail", 254),
      page: readPositiveInteger(req.query.page, { fallback: 1, max: 10000 }),
      limit: readPositiveInteger(req.query.limit, { fallback: 50, max: 200 }),
    }),
  );
}

/** GET /admin/api/v1/database/export — arquivo JSON com todo o conteúdo. */
export async function exportDatabase(req, res) {
  const content = await exportContent(readActor(req));
  const day = content.exportedAt.slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="signa-ludus-conteudo-${day}.json"`);
  res.json(content);
}

/** POST /admin/api/v1/database/seed — cria o conteúdo padrão que estiver faltando (não sobrescreve nada). */
export async function runSeed(req, res) {
  const summary = await seedContent();
  await recordAudit(readActor(req), { action: "seed", entity: "database", summary: "Rodou o seed (só cria o que falta)", after: summary });
  res.json({ summary });
}
