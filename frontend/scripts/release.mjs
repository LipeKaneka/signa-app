// Lança uma versão nova do APK com controle de versão local.
// Uso (na pasta frontend):  npm run release -- 1.2 "Resumo do que mudou" [--publicar]
//  1. aumenta o versionCode e troca o versionName em android/app/build.gradle;
//  2. gera o APK (vite build --mode android → cap sync → gradle assembleDebug);
//  3. guarda em ../releases/Signa-<versão>.apk e acrescenta a linha em ../releases/HISTORICO.md e versoes.txt;
//  4. sem --publicar: mostra os comandos de commit, tag e GitHub (feitos por você, depois de conferir);
//     com --publicar: faz o commit da versão, a tag, o push e cria a release no GitHub com o APK anexado.
//     Acesso ao GitHub: variável GITHUB_TOKEN ou, sem ela, o login que o git já usa no push (nunca é mostrado).
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const publish = args.includes("--publicar");
const [rawVersion, ...summaryWords] = args.filter((arg) => arg !== "--publicar");
const summary = summaryWords.join(" ").trim();
if (!/^\d+\.\d+(\.\d+)?$/.test(rawVersion ?? "") || !summary) {
  console.error('Uso: npm run release -- <versão, ex.: 1.2> "Resumo do que mudou" [--publicar]');
  process.exit(1);
}
const label = rawVersion.split(".").length === 2 ? `${rawVersion}.0` : rawVersion;

const frontend = resolve(import.meta.dirname, "..");
const releases = resolve(frontend, "..", "releases");
const gradleFile = join(frontend, "android", "app", "build.gradle");
const historyFile = join(releases, "HISTORICO.md");
const listFile = join(releases, "versoes.txt");

if (readFileSync(listFile, "utf8").split("\n").some((line) => line.startsWith(`${label}|`))) {
  console.error(`A versão ${label} já existe em releases/versoes.txt.`);
  process.exit(1);
}

// 1) versionCode + 1 e versionName novo.
let gradle = readFileSync(gradleFile, "utf8");
const currentCode = Number(/versionCode (\d+)/.exec(gradle)?.[1]);
if (!currentCode) throw new Error("versionCode não encontrado em build.gradle");
const versionCode = currentCode + 1;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${rawVersion}"`);
writeFileSync(gradleFile, gradle);
console.log(`Versão ${rawVersion} (versionCode ${versionCode})`);

// Java e SDK do Android (no Windows, os instalados em %LOCALAPPDATA%\Android).
const env = { ...process.env };
if (!env.JAVA_HOME && env.LOCALAPPDATA) {
  const jdk = readdirSync(join(env.LOCALAPPDATA, "Android")).find((name) => name.startsWith("jdk-21"));
  if (jdk) env.JAVA_HOME = join(env.LOCALAPPDATA, "Android", jdk);
}
if (!env.ANDROID_HOME && env.LOCALAPPDATA) env.ANDROID_HOME = join(env.LOCALAPPDATA, "Android", "Sdk");
const run = (command, cwd = frontend) => execSync(command, { cwd, env, stdio: "inherit" });

// 2) APK.
run("npx vite build --mode android");
run("npx cap sync android");
const android = join(frontend, "android");
// Caminho completo: no Windows o cmd nem sempre procura o gradlew.bat na pasta atual.
run(process.platform === "win32" ? `"${join(android, "gradlew.bat")}" assembleDebug -q` : "./gradlew assembleDebug -q", android);
const apkDir = join(android, "app", "build", "outputs", "apk", "debug");
const apk = readdirSync(apkDir).find((name) => name.endsWith(".apk"));
if (!apk) throw new Error("APK não encontrado");

// 3) Guarda o APK e o histórico.
const target = join(releases, `Signa-${label}.apk`);
copyFileSync(join(apkDir, apk), target);
const date = new Date().toLocaleDateString("pt-BR");
const commit = execSync("git rev-parse --short HEAD", { cwd: frontend }).toString().trim();
appendFileSync(listFile, `${label}|${commit}|${date}|${summary}\n`);
if (existsSync(historyFile)) {
  const history = readFileSync(historyFile, "utf8");
  const header = "|---|---|---|---|---|\n";
  const row = `| **${label}** | ${date} | ${versionCode} | \`v${label}\` | ${summary.replace(/\|/g, "/")} |\n`;
  writeFileSync(historyFile, history.replace(header, header + row));
}

// 4) Próximos passos (ou publicação automática).
const repoRoot = resolve(frontend, "..");
const git = (command) => execSync(`git ${command}`, { cwd: repoRoot, encoding: "utf8" }).trim();
const releaseBody = `${summary}

versionCode: ${versionCode}`;

if (!publish) {
  console.log(`
APK salvo em releases/Signa-${label}.apk

Confira o app e depois registre a versão:
  git add frontend/android/app/build.gradle releases/HISTORICO.md releases/versoes.txt
  git commit -m "Versão ${rawVersion}"
  git tag -a v${label} -m "Signa ${label}: ${summary}"

Para avisar os usuários (GitHub Releases), de uma vez:  npm run release -- ... --publicar
ou à mão:
  1. git push origin v${label}
  2. No GitHub: Releases → Draft a new release → tag v${label} → anexe releases/Signa-${label}.apk
     Descrição (copie):
       ${summary}

       versionCode: ${versionCode}
  3. No painel: Configurações → Atualização do app → "Buscar no GitHub" → "Aplicar estes dados".
`);
  process.exit(0);
}

/** Token do GitHub: GITHUB_TOKEN ou o do gerenciador de credenciais do git (o mesmo usado no push). */
function readGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const output = execSync("git credential fill", { cwd: repoRoot, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
  const token = /^password=(.+)$/m.exec(output)?.[1];
  if (!token) throw new Error("Sem acesso ao GitHub: defina GITHUB_TOKEN ou faça um git push uma vez para salvar o login.");
  return token;
}

/** "dono/repositorio" a partir do remoto origin (https ou ssh). */
function readRepoName() {
  const url = git("remote get-url origin");
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error(`O remoto origin não é do GitHub: ${url}`);
  return match[1];
}

async function github(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "signa-release", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}: ${body.message ?? "erro"}`);
  return body;
}

// Commit só dos arquivos da versão (o código já deve estar commitado), tag e push.
git("add frontend/android/app/build.gradle releases/HISTORICO.md releases/versoes.txt");
execSync(`git commit -m "Versão ${rawVersion}: ${summary.replace(/"/g, "'")}"`, { cwd: repoRoot, stdio: "inherit" });
git(`tag -a v${label} -m "Signa ${label}: ${summary.replace(/"/g, "'")}"`);
execSync(`git push origin HEAD v${label}`, { cwd: repoRoot, stdio: "inherit" });

const token = readGitHubToken();
const repo = readRepoName();
const release = await github(`https://api.github.com/repos/${repo}/releases`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tag_name: `v${label}`, name: `Signa ${label}`, body: releaseBody, make_latest: "true" }),
});
const apkName = `Signa-${label}.apk`;
const uploadUrl = release.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(apkName)}`);
const asset = await github(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": "application/vnd.android.package-archive" },
  body: readFileSync(target),
});

console.log(`
Release publicada: ${release.html_url}
APK: ${asset.browser_download_url}

Para avisar os usuários: no painel, Configurações → Atualização do app → "Buscar no GitHub" → "Aplicar estes dados".
`);
