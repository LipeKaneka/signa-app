import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ActiveBadge, Badge, Field, LoadState, Modal, Notice, confirmAction, useAction, useLoad } from "../components/ui.jsx";
import { Num } from "../format-number.jsx";
import { AchievementAppearanceEditor, AchievementBadge, DEFAULT_ACHIEVEMENT_APPEARANCE, EFFECTS, RarityTag } from "../components/AchievementLook.jsx";

/** Formulário de conquista. A métrica vem de uma lista fixa (cada métrica é um cálculo no servidor). */
function AchievementForm({ achievement, metrics, tiers, onClose, onSaved }) {
  const [form, setForm] = useState({
    key: achievement?.key ?? "",
    title: achievement?.title ?? "",
    description: achievement?.description ?? "",
    metric: achievement?.metric ?? metrics[0]?.id ?? "",
    goal: achievement?.goal ?? 1,
    icon: achievement?.icon ?? "medal",
    order: achievement?.order ?? 0,
    secret: achievement?.secret === true,
    appearance: { ...DEFAULT_ACHIEVEMENT_APPEARANCE, ...(achievement?.appearance ?? {}) },
  });
  const { run, busy, message } = useAction();
  const set = (changes) => setForm({ ...form, ...changes });
  const setAppearance = (changes) => setForm((current) => ({ ...current, appearance: { ...current.appearance, ...changes } }));

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
              {/* Agrupado como no servidor (Progresso, Dicionário, Toques em ícones, Uso do app). */}
              {[...new Set(metrics.map((metric) => metric.group ?? "Outras"))].map((group) => (
                <optgroup key={group} label={group}>
                  {metrics.filter((metric) => (metric.group ?? "Outras") === group).map((metric) => (
                    <option key={metric.id} value={metric.id}>{metric.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Meta"><input type="number" min={1} value={form.goal} onChange={(e) => set({ goal: e.target.value })} required /></Field>
        </div>
        <div className="form__row">
          <Field label="Ícone"><input value={form.icon} onChange={(e) => set({ icon: e.target.value })} maxLength={40} /></Field>
          <Field label="Ordem no perfil"><input type="number" min={0} value={form.order} onChange={(e) => set({ order: e.target.value })} /></Field>
        </div>
        <AchievementAppearanceEditor value={form.appearance} onChange={setAppearance} title={form.title} description={form.description} tiers={tiers} />
        <label className="check secret-check">
          <input type="checkbox" checked={form.secret} onChange={(e) => set({ secret: e.target.checked })} />
          <span>
            <strong>Conquista secreta</strong>
            <span className="field__hint"> No app, enquanto bloqueada, aparece como "Conquista secreta": sem título, descrição nem progresso. Ao desbloquear, mostra tudo.</span>
          </span>
        </label>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

const TIER_COLOR_FIELDS = [
  ["tagBackground", "Fundo do selo"],
  ["tagText", "Texto do selo"],
];
const PRESET_COLOR_FIELDS = [
  ["colorFrom", "Medalha (início)"],
  ["colorTo", "Medalha (fim)"],
  ["accentColor", "Borda e brilho"],
];

/** Formulário de raridade: nome, cores do selo e a aparência que ela sugere para as conquistas. */
function TierForm({ tier, onClose, onSaved }) {
  const [form, setForm] = useState({
    key: tier?.key ?? "",
    label: tier?.label ?? "",
    tagBackground: tier?.tagBackground ?? "#ede4ff",
    tagText: tier?.tagText ?? "#4f31bb",
    preset: { colorFrom: "#4f31bb", colorTo: "#4f31bb", accentColor: "#4f31bb", effect: "none", ...(tier?.preset ?? {}) },
  });
  const { run, busy, message } = useAction();
  const set = (changes) => setForm((current) => ({ ...current, ...changes }));
  const setPreset = (changes) => setForm((current) => ({ ...current, preset: { ...current.preset, ...changes } }));

  const submit = (event) => {
    event.preventDefault();
    const body = { ...form };
    if (tier) delete body.key;
    run(async () => {
      await api(tier ? `/achievement-tiers/${tier.id}` : "/achievement-tiers", { method: tier ? "PATCH" : "POST", body });
      onSaved();
    });
  };

  return (
    <Modal title={tier ? "Editar raridade" : "Nova raridade"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="tier-form__preview">
          <RarityTag rarity={{ label: form.label || "Nome", tagBackground: form.tagBackground, tagText: form.tagText }} />
          <AchievementBadge appearance={form.preset} size={44} />
        </div>
        {!tier && (
          <Field label="Chave" hint="Identificador fixo: letras minúsculas, números, _ ou - (ex.: mitica).">
            <input value={form.key} onChange={(e) => set({ key: e.target.value })} maxLength={40} required pattern="[a-z0-9_\-]+" />
          </Field>
        )}
        <Field label="Nome no selo">
          <input value={form.label} onChange={(e) => set({ label: e.target.value })} maxLength={30} required placeholder="Mítica" />
        </Field>
        <div className="color-grid">
          {TIER_COLOR_FIELDS.map(([field, label]) => (
            <label key={field} className="color-field">
              <input type="color" value={form[field]} onChange={(e) => set({ [field]: e.target.value })} />
              <span>{label}<code>{form[field]}</code></span>
            </label>
          ))}
        </div>
        <fieldset className="appearance-editor">
          <legend>Aparência sugerida para as conquistas</legend>
          <p className="field__hint">Ao escolher esta raridade numa conquista, estas cores e o efeito são preenchidos (dá para mudar em cada conquista).</p>
          <div className="color-grid">
            {PRESET_COLOR_FIELDS.map(([field, label]) => (
              <label key={field} className="color-field">
                <input type="color" value={form.preset[field]} onChange={(e) => setPreset({ [field]: e.target.value })} />
                <span>{label}<code>{form.preset[field]}</code></span>
              </label>
            ))}
          </div>
          <Field label="Efeito">
            <select value={form.preset.effect} onChange={(e) => setPreset({ effect: e.target.value })}>
              {EFFECTS.map(([effect, label]) => <option key={effect} value={effect}>{label}</option>)}
            </select>
          </Field>
        </fieldset>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Raridades em ordem: da mais comum (em cima) para a mais rara (embaixo). ↑/↓ mudam a posição na escala.
 * Mostra quantas conquistas usam cada uma; apagar deixa essas conquistas sem raridade.
 */
function TiersSection({ tiers, achievements, onChanged }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const { run, busy, message } = useAction();
  const usage = (key) => achievements.filter((achievement) => achievement.appearance?.tier === key).length;

  const move = (index, step) => {
    const ids = tiers.map((tier) => tier.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    run(async () => {
      await api("/achievement-tiers/order", { method: "PUT", body: { ids } });
      onChanged();
    });
  };
  const remove = (tier) => {
    const used = usage(tier.key);
    const extra = used > 0 ? ` ${used} conquista(s) vão ficar sem raridade.` : "";
    if (!confirmAction(`Apagar a raridade "${tier.label}"?${extra}`, { destructive: true })) return;
    run(async () => {
      await api(`/achievement-tiers/${tier.id}`, { method: "DELETE" });
      onChanged();
    });
  };

  return (
    <section className="tiers">
      <div className="toolbar">
        <h2>Raridades</h2>
        {can("content") && <button className="button" onClick={() => setEditing("new")}>Nova raridade</button>}
      </div>
      <p className="muted">
        Da mais comum (em cima) para a mais rara (embaixo). Use as setas para mudar qual é mais rara; uma raridade nova entra
        como a mais rara.
      </p>
      <Notice message={message} />
      <ol className="tier-list">
        {tiers.map((tier, index) => (
          <li key={tier.id} className="tier-list__item">
            <span className="tier-list__rank">{index + 1}</span>
            <AchievementBadge appearance={tier.preset} size={34} />
            <RarityTag rarity={tier} />
            <span className="field__hint">{tier.key} · {usage(tier.key)} conquista(s)</span>
            {can("content") && (
              <span className="tier-list__actions">
                <button type="button" className="button button--ghost" disabled={busy || index === 0} onClick={() => move(index, -1)}
                  aria-label={`Deixar ${tier.label} mais comum`} title="Mais comum">↑</button>
                <button type="button" className="button button--ghost" disabled={busy || index === tiers.length - 1} onClick={() => move(index, 1)}
                  aria-label={`Deixar ${tier.label} mais rara`} title="Mais rara">↓</button>
                <button type="button" className="button button--ghost" onClick={() => setEditing(tier)}>Editar</button>
                {can("manage") && tiers.length > 1 && (
                  <button type="button" className="button button--danger" onClick={() => remove(tier)}>Apagar</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <TierForm
          tier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
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
      <p className="muted">
        O desbloqueio é calculado pelo progresso de cada usuário: mudar a meta vale na hora para todos. Conquistas de acertos
        aparecem para a pessoa durante a atividade, no momento em que ela alcança a meta. Secretas ficam escondidas no app até
        serem desbloqueadas.
      </p>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <table className="table">
          <thead><tr><th>Ordem</th><th>Conquista</th><th>Mede</th><th>Meta</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {data.achievements.map((achievement) => (
              <tr key={achievement.id}>
                <td className="table__order">{achievement.order}</td>
                <td>
                  <div className="ach-row">
                    <AchievementBadge appearance={achievement.appearance} size={38} />
                    <div>
                      <strong>{achievement.title}</strong>
                      {achievement.appearance?.tier && <> <RarityTag rarity={data.tiers.find((tier) => tier.key === achievement.appearance.tier)} /></>}
                      {achievement.secret && <> <Badge tone="warn">Secreta</Badge></>}
                      <div className="field__hint">{achievement.description} · {achievement.key}</div>
                    </div>
                  </div>
                </td>
                <td>{metricLabel(achievement.metric)}</td>
                <td><Num value={achievement.goal} /></td>
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
      {data && <TiersSection tiers={data.tiers} achievements={data.achievements} onChanged={reload} />}
      {editing && (
        <AchievementForm
          achievement={editing === "new" ? null : editing}
          metrics={data.metrics}
          tiers={data.tiers}
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
