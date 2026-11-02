// Cria o PRIMEIRO owner do painel (as demais contas são criadas no próprio painel, por um owner).
// Uso:  npm run admin:create-owner -- --email voce@exemplo.com --name "Seu nome"
// A senha é pedida no terminal sem aparecer na tela (ou lida de ADMIN_PASSWORD, para automação).
// Recusa se já existir um owner: para recuperar o acesso, use --reset-password com o e-mail de um owner.
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { getEnvironment } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/database/database.js";
import { AdminModel } from "../src/models/model-admin.js";
import { createAdmin } from "../src/services/service-admin-accounts.js";
import { hashAdminPassword, endAllAdminSessions } from "../src/services/service-admin-auth.js";
import { recordAudit } from "../src/services/service-audit.js";
import { readEmail, readRequiredString, readAdminPassword } from "../src/utils/util-validators.js";

/**
 * Pergunta algo no terminal sem mostrar o que é digitado.
 * @param {string} question
 * @returns {Promise<string>}
 */
function askHidden(question) {
  return new Promise((resolve) => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    terminal._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(text);
    };
    terminal.question(question, (answer) => {
      terminal.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/**
 * Senha nova: ADMIN_PASSWORD ou digitada duas vezes.
 * @returns {Promise<string>}
 */
async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return readAdminPassword(process.env.ADMIN_PASSWORD);
  const password = readAdminPassword(await askHidden("Senha (12+ caracteres, letras e números): "));
  if ((await askHidden("Repita a senha: ")) !== password) throw new Error("As senhas não conferem.");
  return password;
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, "reset-password": { type: "boolean" } },
  });
  const email = readEmail(values.email);
  const actor = { admin: null, ip: "linha de comando" };
  await connectDatabase(getEnvironment().databaseUrl);

  if (values["reset-password"]) {
    const owner = await AdminModel.findOne({ email, role: "owner" });
    if (!owner) throw new Error("Não existe owner com este e-mail.");
    owner.passwordHash = await hashAdminPassword(await readPassword());
    owner.status = "active";
    await owner.save();
    await endAllAdminSessions(owner._id);
    await recordAudit(actor, { action: "reset_password", entity: "admin", entityId: owner._id, summary: `Senha do owner ${email} redefinida pelo terminal` });
    console.log(`Senha do owner ${email} redefinida.`);
    return;
  }

  if (await AdminModel.exists({ role: "owner" })) {
    throw new Error("Já existe um owner. Crie as outras contas pelo painel (ou use --reset-password).");
  }
  const name = readRequiredString(values.name ?? "Owner", "o nome", 80);
  await createAdmin(actor, { email, name, role: "owner", password: await readPassword() });
  console.log(`Owner ${email} criado. Entre em http://${getEnvironment().host}:${getEnvironment().port}/admin`);
}

main()
  .catch((error) => {
    console.error("Não foi possível concluir:", error.message);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
