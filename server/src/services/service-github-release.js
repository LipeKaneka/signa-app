import { badRequest, HttpError } from "../utils/util-http-error.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const REQUEST_TIMEOUT_MS = 10 * 1000;
const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const NOTES_MAX_LENGTH = 600;
/** Linha "versionCode: 5" (ou "versionCode 5", "versionCode=5") na descrição da release. */
const VERSION_CODE_LINE = /^[\s>*_-]*version\s*code\s*[:=]?\s*\**\s*(\d{1,10})\**\s*$/im;

/** GET no GitHub com tempo-limite; GITHUB_TOKEN (opcional) aumenta o limite de consultas e lê repositório privado. */
async function getFromGitHub(url, accept = "application/vnd.github+json") {
  const headers = { Accept: accept, "User-Agent": "signa-ludus-painel" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    return await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    console.error("GitHub inacessível:", error.message);
    throw new HttpError(503, "Não foi possível falar com o GitHub agora. Tente de novo.");
  }
}

/** "v1.4.0" → "1.4"; "v1.4.2" → "1.4.2"; "1.5" → "1.5" (mesmo formato do versionName do APK). */
export function versionNameFromTag(tag) {
  const match = /^v?(\d+(?:\.\d+){0,2})$/i.exec(String(tag ?? "").trim());
  if (!match) return "";
  const parts = match[1].split(".");
  return parts.length === 3 && parts[2] === "0" ? `${parts[0]}.${parts[1]}` : match[1];
}

/**
 * Texto da release → novidades para a tela de atualização: tira a linha do versionCode, títulos "#" e excesso de
 * linhas em branco; corta em 600 caracteres.
 */
export function notesFromReleaseBody(body) {
  const text = String(body ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !VERSION_CODE_LINE.test(line))
    .map((line) => line.replace(/^#{1,6}\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > NOTES_MAX_LENGTH ? `${text.slice(0, NOTES_MAX_LENGTH - 1).trimEnd()}…` : text;
}

/** versionCode escrito na descrição da release ("versionCode: 5"), ou null. */
export function versionCodeFromBody(body) {
  const match = VERSION_CODE_LINE.exec(String(body ?? ""));
  return match ? Number(match[1]) : null;
}

/** versionCode da linha "| **1.4.0** | data | 5 | ..." do releases/HISTORICO.md, ou null. */
export function versionCodeFromHistory(markdown, label) {
  const escaped = label.replace(/\./g, "\\.");
  const match = new RegExp(`^\\|\\s*\\**${escaped}\\**\\s*\\|[^|]*\\|\\s*(\\d+)\\s*\\|`, "m").exec(String(markdown ?? ""));
  return match ? Number(match[1]) : null;
}

/**
 * Lê a release mais recente do GitHub e monta os campos de "Atualização do app" (não salva nada).
 * - versionName: da tag (v1.4.0 → 1.4).
 * - versionCode: linha "versionCode: N" na descrição; se não tiver, o releases/HISTORICO.md da própria tag.
 * - downloadUrl: o primeiro arquivo .apk anexado à release.
 * - notes: a descrição da release (sem a linha do versionCode).
 * @param {string} repo - "dono/nome".
 * @returns {Promise<{repo: string, tag: string, name: string, publishedAt: string, htmlUrl: string,
 *   fields: {versionName: string, latestVersionCode: number|null, downloadUrl: string, notes: string}, warnings: string[]}>}
 * @throws {HttpError} 400 repositório inválido; 404 sem release (ou repositório privado); 503 GitHub fora do ar.
 * Usado por: GET /admin/api/v1/app-update/github.
 */
export async function readLatestRelease(repo) {
  const name = String(repo ?? "").trim();
  if (!REPO_PATTERN.test(name)) throw badRequest("Repositório inválido. Use o formato dono/nome (ex.: LipeKaneka/signa-app).");

  const response = await getFromGitHub(`${GITHUB_API}/repos/${name}/releases/latest`);
  if (response.status === 404) {
    throw new HttpError(404, `Nenhuma release publicada em ${name} (ou o repositório é privado).`);
  }
  if (!response.ok) {
    console.error(`GitHub respondeu ${response.status} para ${name}.`);
    throw new HttpError(503, response.status === 403 ? "Limite de consultas do GitHub atingido. Tente em alguns minutos." : "O GitHub não respondeu como esperado.");
  }
  const release = await response.json();
  const warnings = [];

  const versionName = versionNameFromTag(release.tag_name);
  if (!versionName) warnings.push(`A tag "${release.tag_name}" não parece uma versão (ex.: v1.4.0): preencha o nome à mão.`);

  let latestVersionCode = versionCodeFromBody(release.body);
  if (latestVersionCode === null && versionName) {
    const label = versionName.split(".").length === 2 ? `${versionName}.0` : versionName;
    const history = await getFromGitHub(`${GITHUB_RAW}/${name}/${encodeURIComponent(release.tag_name)}/releases/HISTORICO.md`, "text/plain");
    if (history.ok) latestVersionCode = versionCodeFromHistory(await history.text(), label);
  }
  if (latestVersionCode === null) {
    warnings.push("Número da versão (versionCode) não encontrado: escreva \"versionCode: N\" na descrição da release.");
  }

  const apk = (release.assets ?? []).find((asset) => /\.apk$/i.test(asset.name));
  if (!apk) warnings.push("A release não tem um arquivo .apk anexado.");

  return {
    repo: name,
    tag: release.tag_name,
    name: release.name || release.tag_name,
    publishedAt: release.published_at,
    htmlUrl: release.html_url,
    fields: {
      versionName,
      latestVersionCode,
      downloadUrl: apk?.browser_download_url ?? "",
      notes: notesFromReleaseBody(release.body),
    },
    warnings,
  };
}
