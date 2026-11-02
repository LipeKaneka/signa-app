import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { LoadState, Notice, useAction, useLoad } from "../components/ui.jsx";

/** Tabela de níveis: o nível de cada usuário é calculado pelo XP (mudar a tabela vale para todos na hora). */
export function LevelsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/levels"), []);
  const [levels, setLevels] = useState([]);
  const { run, busy, message } = useAction();
  const editable = can("manage");

  useEffect(() => {
    if (data) setLevels(data.levels.map(({ minXp, title }) => ({ minXp, title })));
  }, [data]);

  const set = (index, changes) => setLevels(levels.map((level, i) => (i === index ? { ...level, ...changes } : level)));
  const save = () =>
    run(async () => {
      const body = { levels: levels.map((level) => ({ title: level.title, minXp: Number(level.minXp) })) };
      const saved = await api("/levels", { method: "PUT", body });
      setLevels(saved.levels.map(({ minXp, title }) => ({ minXp, title })));
    }, "Tabela de níveis salva.");

  return (
    <section>
      <h1>Níveis</h1>
      <p className="muted">Em ordem: o nível 1 começa em 0 XP e cada nível precisa de mais XP que o anterior.</p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <table className="table">
            <thead><tr><th>Nível</th><th>Nome</th><th>A partir de (XP)</th><th /></tr></thead>
            <tbody>
              {levels.map((level, index) => (
                <tr key={index}>
                  <td className="table__order">{index + 1}</td>
                  <td><input value={level.title} disabled={!editable} onChange={(e) => set(index, { title: e.target.value })} maxLength={60} /></td>
                  <td><input type="number" min={0} value={level.minXp} disabled={!editable || index === 0} onChange={(e) => set(index, { minXp: e.target.value })} /></td>
                  <td>{editable && levels.length > 1 && <button className="icon-button" onClick={() => setLevels(levels.filter((_, i) => i !== index))} aria-label="Remover nível">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <div className="form__actions">
              <button
                className="button button--ghost"
                onClick={() => setLevels([...levels, { title: "", minXp: Number(levels[levels.length - 1]?.minXp ?? 0) + 100 }])}
              >
                + nível
              </button>
              <button className="button" onClick={save} disabled={busy}>Salvar tabela</button>
            </div>
          )}
          <Notice message={message} />
        </div>
      )}
    </section>
  );
}
