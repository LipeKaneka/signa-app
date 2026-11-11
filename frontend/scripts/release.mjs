// Lança uma versão nova do APK com controle de versão local.
// Uso (na pasta frontend):  npm run release -- 1.2 "Resumo do que mudou"
//  1. aumenta o versionCode e troca o versionName em android/app/build.gradle;
//  2. gera o APK (vite build --mode android → cap sync → gradle assembleDebug);
//  3. guarda em ../releases/Signa-<versão>.apk e acrescenta a linha em ../releases/HISTORICO.md e versoes.txt;
//  4. mostra os comandos de commit e tag (feitos por você, depois de conferir).
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [rawVersion, ...summaryWords] = process.argv.slice(2);
const summary = summaryWords.join(" ").trim();
if (!/^\d+\.\d+(\.\d+)?$/.test(rawVersion ?? "") || !summary) {
  console.error('Uso: npm run release -- <versão, ex.: 1.2> "Resumo do que mudou"');
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

// 4) Próximos passos.
console.log(`
APK salvo em releases/Signa-${label}.apk

Confira o app e depois registre a versão:
  git add frontend/android/app/build.gradle releases/HISTORICO.md releases/versoes.txt
  git commit -m "Versão ${rawVersion}"
  git tag -a v${label} -m "Signa ${label}: ${summary}"

Para avisar os usuários: publique o APK num link (ex.: GitHub Releases) e, no painel, em
Configurações → Atualização do app, coloque o link, o número ${versionCode} e o nome ${rawVersion}.
`);
