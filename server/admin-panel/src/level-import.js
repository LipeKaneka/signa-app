/**
 * Leitura de níveis em lote para a tela "Níveis" do painel: JSON, CSV ou linhas copiadas de uma planilha.
 *
 * Formatos aceitos:
 * - JSON: [{"title": "Iniciante", "minXp": 0}, ...] ou {"levels": [...]} (também aceita "nome"/"name" e "xp").
 * - Uma linha por nível, com o nome e o XP separados por tabulação (colado do Excel/Sheets), ";" ou ",":
 *   "Iniciante;0", "0,Iniciante", "Mestre	1,5K". A primeira linha pode ser um cabeçalho (é ignorada).
 * O XP aceita "1000", "1.000", "1 000" e abreviações "1K", "1,5K", "2M".
 */

const SUFFIXES = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * Converte um texto de XP em número inteiro.
 * @param {unknown} raw
 * @returns {number|null} null se não for um número.
 */
export function parseXp(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  const text = String(raw ?? "").trim().toLowerCase().replace(/\s|_/g, "").replace(/xp$/, "");
  if (!text) return null;
  const abbreviated = /^(\d+(?:[.,]\d+)?)([kmb])$/.exec(text);
  if (abbreviated) return Math.round(Number(abbreviated[1].replace(",", ".")) * SUFFIXES[abbreviated[2]]);
  // Pontos ou vírgulas como separador de milhar: "1.000", "10,000".
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) return Number(text.replace(/[.,]/g, ""));
  return /^\d+$/.test(text) ? Number(text) : null;
}

/** Separador da linha: tabulação (planilha), ";" ou ",". */
function splitLine(line) {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  // Com vírgula: o XP também pode ter vírgula ("1,5K", "1,000"), e o nome também. Tenta, nesta ordem:
  // XP nas duas últimas partes, XP na última, XP nas duas primeiras, XP na primeira.
  const parts = line.split(",");
  if (parts.length <= 2) return parts;
  const options = [
    [parts.slice(0, -2).join(","), parts.slice(-2).join(",")],
    [parts.slice(0, -1).join(","), parts[parts.length - 1]],
    [parts.slice(0, 2).join(","), parts.slice(2).join(",")],
    [parts[0], parts.slice(1).join(",")],
  ];
  return options.find((cells) => cells.some((cell) => parseXp(cell) !== null)) ?? parts;
}

/**
 * Lê o texto colado (ou o conteúdo do arquivo).
 * @param {string} text
 * @returns {{levels: {title: string, minXp: number}[], errors: string[]}}
 */
export function parseLevelsText(text) {
  const trimmed = String(text ?? "").replace(/^﻿/, "").trim();
  if (!trimmed) return { levels: [], errors: ["Cole os níveis ou escolha um arquivo."] };

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      return { levels: [], errors: [`JSON inválido: ${error.message}`] };
    }
    const list = Array.isArray(data) ? data : data?.levels;
    if (!Array.isArray(list)) return { levels: [], errors: ['Use uma lista [{"title": "...", "minXp": 0}] ou {"levels": [...]}.'] };
    const levels = [];
    const errors = [];
    list.forEach((item, index) => {
      const title = String(item?.title ?? item?.nome ?? item?.name ?? "").trim();
      const minXp = parseXp(item?.minXp ?? item?.xp ?? item?.min_xp);
      if (!title) errors.push(`Item ${index + 1}: falta o nome ("title").`);
      else if (minXp === null) errors.push(`Item ${index + 1} ("${title}"): XP inválido.`);
      else levels.push({ title, minXp });
    });
    return { levels, errors };
  }

  const levels = [];
  const errors = [];
  trimmed.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const cells = splitLine(line).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean);
    const xpIndex = cells.findIndex((cell) => parseXp(cell) !== null);
    if (xpIndex === -1) {
      if (index === 0) return; // cabeçalho, ex.: "nome;xp"
      errors.push(`Linha ${index + 1}: não achei o XP em "${line.trim()}".`);
      return;
    }
    const title = cells.filter((_, cellIndex) => cellIndex !== xpIndex).join(" ").trim();
    if (!title) errors.push(`Linha ${index + 1}: falta o nome do nível.`);
    else levels.push({ title, minXp: parseXp(cells[xpIndex]) });
  });
  return { levels, errors };
}

/**
 * Ordena por XP (o nível 1 é o de menor XP).
 * @param {{title: string, minXp: number|string}[]} levels
 * @returns {{title: string, minXp: number|string}[]}
 */
export function sortLevels(levels) {
  return [...levels].sort((a, b) => Number(a.minXp) - Number(b.minXp));
}

/**
 * Junta a tabela atual com os níveis importados: o mesmo XP troca o nome; os novos entram. Resultado ordenado.
 * @param {{title: string, minXp: number}[]} current
 * @param {{title: string, minXp: number}[]} imported
 */
export function mergeLevels(current, imported) {
  const byXp = new Map(current.map((level) => [Number(level.minXp), { ...level, minXp: Number(level.minXp) }]));
  imported.forEach((level) => byXp.set(level.minXp, level));
  return sortLevels([...byXp.values()]);
}

/**
 * Problemas que o servidor recusaria (para avisar antes de salvar).
 * @param {{title: string, minXp: number|string}[]} levels - já ordenados.
 * @returns {string[]}
 */
export function checkLevels(levels) {
  const problems = [];
  if (levels.length === 0) return ["A tabela precisa de pelo menos 1 nível."];
  if (levels.length > 100) problems.push(`São ${levels.length} níveis; o máximo é 100.`);
  if (Number(levels[0].minXp) !== 0) problems.push("Falta um nível começando em 0 XP (o nível 1).");
  levels.forEach((level, index) => {
    if (!String(level.title).trim()) problems.push(`Nível ${index + 1}: falta o nome.`);
    if (index > 0 && Number(level.minXp) === Number(levels[index - 1].minXp)) {
      problems.push(`"${levels[index - 1].title}" e "${level.title}" têm o mesmo XP (${level.minXp}).`);
    }
  });
  return problems;
}

/** Tabela atual como CSV (abre no Excel/Sheets; separador ";", com BOM para acentos). */
export function levelsToCsv(levels) {
  const escape = (value) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿nome;xp\n${levels.map((level) => `${escape(String(level.title))};${level.minXp}`).join("\n")}\n`;
}
