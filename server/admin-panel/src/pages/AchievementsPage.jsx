import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ActiveBadge, Field, LoadState, Modal, Notice, confirmAction, useAction, useLoad } from "../components/ui.jsx";

/** Formulário de conquista. A métrica vem de uma lista fixa (cada métrica é um cálculo no servidor). */
function AchievementForm({ achievement, metrics, onClose, onSaved }) {
  const [form, setForm] = useState({
    key: achievement?.key ?? "",
    title: achievement?.title ?? "",
    description: achievement?.description ?? "",
    metric: achievement?.metric ?? metrics[0]?.id ?? "",
    goal: achievement?.goal ?? 1,
    icon: achievement?.icon ?? "medal",
    order: achievement?.order ?? 0,
  });
  const { run, busy, message } = useAction();
  const set = (changes) => setForm({ ...form, ...changes });

  const submit = (event) => {
    event.preventDefault();
    const body = { ...form, goal: Number(form.goal), order: Number(form.order) };
    if (achievement) delete body.key;
    run(async () => {
      await api(achievement ? `/achievements/${achievement.id}` : "/achievements", { method: achievement ? "PATCH" : "POST", body });
      onSaved();
    });
  };

  return (
    <Modal title={achievement ? "Editar conquista" : "Nova conquista"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!achievement && (
          <Field label="Chave" hint="Identificador fixo: letras minúsculas, números e _ (ex.: streak_30).">
            <input value={form.key} onChange={(e) => set({ key: e.target.value })} pattern="[a-z0-9_]+" maxLength={60} required />
          </Field>
        )}
        <Field label="Título"><input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} required /></Field>
        <Field label="Descrição"><input value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} required /></Field>
        <div className="form__row">
          <Field label="O que mede">
            <select value={form.metric} onChange={(e) => set({ metric: e.target.value })}>
              {metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
            </select>
          </Field>
          <Field label="Meta"><input type="number" min={1} value={form.goal} onChange={(e) => set({ goal: e.target.value })} required /></Field>
        </div>
        <div className="form__row">
          <Field label="Ícone"><input value={form.icon} onChange={(e) => set({ icon: e.target.value })} maxLength={40} /></Field>
          <Field label="Ordem no perfil"><input type="number" min={0} value={form.order} onChange={(e) => set({ order: e.target.value })} /></Field>
        </div>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Conquistas: catálogo com meta, métrica e ativação. */
export function AchievementsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/achievements"), []);
  const [editing, setEditing] = useState(null);
  const { run, message } = useAction();
  const metricLabel = (id) => data?.metrics.find((metric) => metric.id === id)?.label ?? id;

  const toggle = (achievement) =>
    run(async () => {
      await api(`/achievements/${achievement.id}`, { method: "PATCH", body: { active: !achievement.active } });
      reload();
    });
  const remove = (achievement) => {
    if (!confirmAction(`Excluir de vez a conquista "${achievement.title}"?`, { destructive: true })) return;
    run(async () => {
      await api(`/achievements/${achievement.id}`, { method: "DELETE" });
      reload();
    });
  };

  return (
    <section>
      <div className="toolbar">
        <h1>Conquistas</h1>
        {can("content") && data && <button className="button" onClick={() => setEditing("new")}>Nova conquista</button>}
      </div>
      <p className="muted">O desbloqueio é calculado pelo progresso de cada usuário: mudar a meta vale na hora para todos.</p>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <table className="table">
          <thead><tr><th>Ordem</th><th>Conquista</th><th>Mede</th><th>Meta</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {data.achievements.map((achievement) => (
              <tr key={achievement.id}>
                <td className="table__order">{achievement.order}</td>
                <td><strong>{achievement.title}</strong><div className="field__hint">{achievement.description} · {achievement.key}</div></td>
                <td>{metricLabel(achievement.metric)}</td>
                <td>{achievement.goal}</td>
                <td><ActiveBadge active={achievement.active} /></td>
                <td className="table__actions">
                  {can("content") && (
                    <>
                      <button className="button button--ghost" onClick={() => setEditing(achievement)}>Editar</button>
                      <button className="button button--ghost" onClick={() => toggle(achievement)}>{achievement.active ? "Desativar" : "Ativar"}</button>
                    </>
                  )}
                  {can("manage") && !achievement.active && <button className="button button--danger" onClick={() => remove(achievement)}>Excluir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <AchievementForm
          achievement={editing === "new" ? null : editing}
          metrics={data.metrics}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
