import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ActiveBadge, Field, LoadState, Modal, Notice, confirmAction, useAction, useLoad } from "../components/ui.jsx";

/** Troca dois itens de lugar numa lista (para subir/descer). */
function move(list, index, direction) {
  const copy = [...list];
  const target = index + direction;
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Formulário de módulo (criar ou editar). */
function ModuleForm({ module, modules, onClose, onSaved }) {
  const [title, setTitle] = useState(module?.title ?? "");
  const [description, setDescription] = useState(module?.description ?? "");
  const [icon, setIcon] = useState(module?.icon ?? "🤟");
  const [level, setLevel] = useState(module?.level ?? 1);
  const lastModule = modules[modules.length - 1];
  const [prerequisiteId, setPrerequisiteId] = useState(module ? module.prerequisiteId ?? "" : lastModule?.id ?? "");
  const { run, busy, message } = useAction();

  const submit = (event) => {
    event.preventDefault();
    const body = { title, description, icon, level: Number(level), prerequisiteId: prerequisiteId || null };
    run(async () => {
      await api(module ? `/modules/${module.id}` : "/modules", { method: module ? "PATCH" : "POST", body });
      onSaved();
    });
  };

  return (
    <Modal title={module ? "Editar módulo" : "Novo módulo"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></Field>
        <Field label="Descrição" hint="Aparece no cartão do módulo, na trilha do app.">
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <div className="form__row">
          <Field label="Ícone (emoji)"><input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={16} /></Field>
          <Field label="Nível"><input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(e.target.value)} required /></Field>
        </div>
        <Field label="Pré-requisito" hint="Módulo que precisa estar concluído para liberar este.">
          <select value={prerequisiteId} onChange={(e) => setPrerequisiteId(e.target.value)}>
            <option value="">Nenhum (liberado desde o início)</option>
            {modules.filter((other) => other.id !== module?.id).map((other) => (
              <option key={other.id} value={other.id}>{other.order}. {other.title}</option>
            ))}
          </select>
        </Field>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Atividades de um módulo: ordem, ativar/desativar, editar, excluir. */
export function ModuleActivities({ module, onChanged }) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api(`/modules/${module.id}/activities`), [module.id]);
  const { run, message } = useAction();
  const activities = data?.activities ?? [];
  const refresh = () => {
    reload();
    onChanged();
  };

  const reorder = (index, direction) =>
    run(async () => {
      const ids = move(activities, index, direction).map((activity) => activity.id);
      await api(`/modules/${module.id}/activities/reorder`, { method: "POST", body: { ids } });
      refresh();
    });
  const toggle = (activity) =>
    run(async () => {
      await api(`/activities/${activity.id}`, { method: "PATCH", body: { active: !activity.active } });
      refresh();
    });
  const remove = (activity) => {
    if (!confirmAction(`Excluir de vez a atividade "${activity.title}"?`, { destructive: true })) return;
    run(async () => {
      await api(`/activities/${activity.id}`, { method: "DELETE" });
      refresh();
    });
  };

  return (
    <div className="subpanel">
      <div className="toolbar">
        <h3>Atividades de "{module.title}"</h3>
        {can("content") && <Link className="button" to={`/atividades/nova?module=${module.id}`}>Montar exercício à mão</Link>}
      </div>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && activities.length === 0 && <p className="muted">Nenhuma atividade. Módulos sem atividade ativa não aparecem no app.</p>}
      <table className="table">
        <tbody>
          {activities.map((activity, index) => (
            <tr key={activity.id}>
              <td className="table__order">{activity.order}</td>
              <td><Link to={`/atividades/${activity.id}`}>{activity.title}</Link></td>
              <td>{activity.questionsPerAttempt ? `${activity.questionsPerAttempt} sorteadas de ${activity.questionCount}` : `${activity.questionCount} perguntas`}</td>
              <td><ActiveBadge active={activity.active} /></td>
              <td className="table__actions">
                {can("content") && (
                  <>
                    <button className="icon-button" disabled={index === 0} onClick={() => reorder(index, -1)} aria-label="Subir">↑</button>
                    <button className="icon-button" disabled={index === activities.length - 1} onClick={() => reorder(index, 1)} aria-label="Descer">↓</button>
                    <button className="button button--ghost" onClick={() => toggle(activity)}>{activity.active ? "Desativar" : "Ativar"}</button>
                  </>
                )}
                {can("manage") && !activity.active && <button className="button button--danger" onClick={() => remove(activity)}>Excluir</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trilha: módulos (ordem, pré-requisito, ativar) e as atividades de cada um. */
export function TrailPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/modules"), []);
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const { run, message } = useAction();
  const modules = data?.modules ?? [];
  const selected = modules.find((module) => module.id === selectedId);
  const titleOf = (id) => modules.find((module) => module.id === id)?.title ?? "—";

  const reorder = (index, direction) =>
    run(async () => {
      await api("/modules/reorder", { method: "POST", body: { ids: move(modules, index, direction).map((module) => module.id) } });
      reload();
    });
  const toggle = (module) =>
    run(async () => {
      await api(`/modules/${module.id}`, { method: "PATCH", body: { active: !module.active } });
      reload();
    });
  const remove = (module) => {
    if (!confirmAction(`Excluir de vez o módulo "${module.title}"?`, { destructive: true })) return;
    run(async () => {
      await api(`/modules/${module.id}`, { method: "DELETE" });
      if (selectedId === module.id) setSelectedId(null);
      reload();
    });
  };

  return (
    <section>
      <div className="toolbar">
        <h1>Trilha</h1>
        {can("content") && <button className="button" onClick={() => setEditing("new")}>Novo módulo</button>}
      </div>
      <p className="muted">As mudanças chegam ao app em poucos segundos, sem APK novo. Desativar esconde do app sem apagar.</p>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      <table className="table">
        <thead>
          <tr><th>#</th><th>Módulo</th><th>Nível</th><th>Pré-requisito</th><th>Atividades</th><th>Situação</th><th /></tr>
        </thead>
        <tbody>
          {modules.map((module, index) => (
            <tr key={module.id} className={module.id === selectedId ? "table__row--selected" : ""}>
              <td className="table__order">{module.order}</td>
              <td>
                <button className="link" onClick={() => setSelectedId(module.id)}>{module.icon} {module.title}</button>
                {module.description && <div className="field__hint">{module.description}</div>}
              </td>
              <td>{module.level}</td>
              <td>{module.prerequisiteId ? titleOf(module.prerequisiteId) : "—"}</td>
              <td>{module.activeActivityCount}/{module.activityCount}</td>
              <td><ActiveBadge active={module.active} /></td>
              <td className="table__actions">
                {can("content") && (
                  <>
                    <button className="icon-button" disabled={index === 0} onClick={() => reorder(index, -1)} aria-label="Subir">↑</button>
                    <button className="icon-button" disabled={index === modules.length - 1} onClick={() => reorder(index, 1)} aria-label="Descer">↓</button>
                    <button className="button button--ghost" onClick={() => setEditing(module)}>Editar</button>
                    <button className="button button--ghost" onClick={() => toggle(module)}>{module.active ? "Desativar" : "Ativar"}</button>
                  </>
                )}
                {can("manage") && !module.active && <button className="button button--danger" onClick={() => remove(module)}>Excluir</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? <ModuleActivities module={selected} onChanged={reload} /> : modules.length > 0 && <p className="muted">Clique num módulo para ver as atividades.</p>}
      {editing && (
        <ModuleForm
          module={editing === "new" ? null : editing}
          modules={modules}
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
