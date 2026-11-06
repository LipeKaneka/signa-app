import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Field, LoadState, Modal, Notice, useAction, useLoad } from "../components/ui.jsx";
import { checkLevels, levelsToCsv, mergeLevels, parseLevelsText, sortLevels } from "../level-import.js";

let nextRowId = 1;
/** Cada linha ganha um id estável: ao reordenar por XP, o campo em edição não perde o foco nem troca de linha. */
const withIds = (levels) => levels.map(({ minXp, title }) => ({ id: nextRowId++, minXp, title }));

const EXAMPLE = `Iniciante;0
Aprendiz;100
Praticante;300
Fluente;1K
Mestre;2,5K`;

/** Baixa um texto como arquivo. */
function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Importar vários níveis de uma vez: colar (JSON, CSV ou linhas da planilha) ou escolher um arquivo. */
function ImportDialog({ current, onApply, onClose }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("replace");
  const parsed = useMemo(() => (text.trim() ? parseLevelsText(text) : null), [text]);
  const result = useMemo(() => {
    if (!parsed || parsed.levels.length === 0) return [];
    return mode === "replace" ? sortLevels(parsed.levels) : mergeLevels(current, parsed.levels);
  }, [parsed, mode, current]);
  const problems = result.length ? checkLevels(result) : [];

  const readFile = async (file) => {
    if (file) setText(await file.text());
  };

  return (
    <Modal title="Importar níveis" onClose={onClose} wide>
      <div className="form">
        <p className="muted">
          Cole um JSON (<code>[{"{"}"title": "Iniciante", "minXp": 0{"}"}]</code>) ou uma linha por nível com nome e XP,
          separados por <strong>;</strong>, vírgula ou tabulação (copiado do Excel/Sheets). Pode ser em qualquer ordem: o
          painel organiza pelo XP. XP aceita 1000, 1.000, 1K, 1,5K, 2M.
        </p>
        <Field label="Níveis">
          <textarea className="import-text" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={EXAMPLE} spellCheck={false} />
        </Field>
        <div className="form__row">
          <Field label="Ou escolha um arquivo" hint=".json, .csv ou .txt">
            <input type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
          </Field>
          <Field label="O que fazer">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="replace">Substituir a tabela inteira</option>
              <option value="merge">Juntar com a atual (mesmo XP troca o nome)</option>
            </select>
          </Field>
        </div>

        {parsed?.errors.length > 0 && (
          <div className="notice notice--error">
            <strong>Linhas ignoradas:</strong>
            <ul className="import-list">{parsed.errors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        )}
        {result.length > 0 && (
          <>
            <p className="muted">Prévia ({result.length} níveis, já em ordem de XP):</p>
            <div className="import-preview">
              <table className="table">
                <thead><tr><th>Nível</th><th>Nome</th><th>A partir de (XP)</th></tr></thead>
                <tbody>
                  {result.map((level, index) => (
                    <tr key={`${level.minXp}-${index}`}><td className="table__order">{index + 1}</td><td>{level.title}</td><td>{Number(level.minXp).toLocaleString("pt-BR")}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {problems.length > 0 && (
          <div className="notice notice--error">
            <strong>Corrija antes de salvar:</strong>
            <ul className="import-list">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
          </div>
        )}

        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="button" disabled={result.length === 0} onClick={() => onApply(result)}>
            Usar estes níveis
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Tabela de níveis: o nível de cada usuário é calculado pelo XP (mudar a tabela vale para todos na hora).
 * As linhas ficam sempre em ordem de XP (o nível 1 é o de 0 XP); dá para importar e exportar em JSON/CSV.
 */
export function LevelsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/levels"), []);
  const [levels, setLevels] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [importing, setImporting] = useState(false);
  const { run, busy, message } = useAction();
  const editable = can("manage");

  useEffect(() => {
    if (data) {
      setLevels(withIds(data.levels));
      setDirty(false);
    }
  }, [data]);

  const change = (next) => {
    setLevels(next);
    setDirty(true);
  };
  const set = (id, changes) => change(levels.map((level) => (level.id === id ? { ...level, ...changes } : level)));
  /** Reordena quando o XP é confirmado (sair do campo/Enter), não a cada tecla: a linha não pula enquanto digita. */
  const sortNow = () => setLevels((current) => sortLevels(current));
  const problems = checkLevels(sortLevels(levels));

  const save = () =>
    run(async () => {
      const body = { levels: sortLevels(levels).map((level) => ({ title: level.title.trim(), minXp: Number(level.minXp) })) };
      const saved = await api("/levels", { method: "PUT", body });
      setLevels(withIds(saved.levels));
      setDirty(false);
    }, "Tabela de níveis salva.");

  const addLevel = () => {
    const highest = levels.reduce((max, level) => Math.max(max, Number(level.minXp) || 0), 0);
    change(sortLevels([...levels, { id: nextRowId++, title: "", minXp: levels.length ? highest + 100 : 0 }]));
  };

  const exportRows = () => sortLevels(levels).map(({ title, minXp }) => ({ title, minXp: Number(minXp) }));

  return (
    <section>
      <div className="toolbar">
        <h1>Níveis</h1>
        {data && (
          <span className="table__actions">
            {editable && <button className="button button--ghost" onClick={() => setImporting(true)}>Importar</button>}
            <button className="button button--ghost" onClick={() => downloadText("niveis.csv", levelsToCsv(exportRows()), "text/csv;charset=utf-8")}>Baixar CSV</button>
            <button className="button button--ghost" onClick={() => downloadText("niveis.json", `${JSON.stringify(exportRows(), null, 2)}\n`, "application/json")}>Baixar JSON</button>
          </span>
        )}
      </div>
      <p className="muted">
        Organizados automaticamente pelo XP: o nível 1 é o de 0 XP e cada nível seguinte precisa de mais XP. Para criar
        muitos de uma vez, use <strong>Importar</strong> (JSON, CSV ou colado de uma planilha).
      </p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Nível</th><th>Nome</th><th>A partir de (XP)</th><th /></tr></thead>
            <tbody>
              {levels.map((level, index) => (
                <tr key={level.id}>
                  <td className="table__order">{index + 1}</td>
                  <td><input value={level.title} disabled={!editable} onChange={(e) => set(level.id, { title: e.target.value })} maxLength={60} aria-label={`Nome do nível ${index + 1}`} /></td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={level.minXp}
                      disabled={!editable}
                      onChange={(e) => set(level.id, { minXp: e.target.value })}
                      onBlur={sortNow}
                      onKeyDown={(e) => e.key === "Enter" && sortNow()}
                      aria-label={`XP mínimo do nível ${index + 1}`}
                    />
                  </td>
                  <td>{editable && levels.length > 1 && <button className="icon-button" onClick={() => change(levels.filter((row) => row.id !== level.id))} aria-label={`Remover o nível ${index + 1}`}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {problems.length > 0 && (
            <div className="notice notice--error">
              <ul className="import-list">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            </div>
          )}
          {editable && (
            <div className="form__actions">
              {dirty && <span className="muted">Alterações não salvas</span>}
              <button className="button button--ghost" onClick={addLevel}>+ nível</button>
              <button className="button" onClick={save} disabled={busy || problems.length > 0}>Salvar tabela</button>
            </div>
          )}
          <Notice message={message} />
        </div>
      )}
      {importing && (
        <ImportDialog
          current={exportRows()}
          onClose={() => setImporting(false)}
          onApply={(imported) => {
            change(withIds(imported));
            setImporting(false);
          }}
        />
      )}
    </section>
  );
}
