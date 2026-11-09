import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { AppProfilePreview } from "../components/AppProfilePreview.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, formatDateTime, useAction, useLoad } from "../components/ui.jsx";
import { Num } from "../format-number.jsx";

const ATTEMPT_STATUS = { finished: "concluída", in_progress: "em andamento", expired: "expirada" };
const ACTIVITY_STATUS = { completed: ["ok", "Concluída"], available: ["warn", "Liberada"], locked: ["neutral", "Bloqueada"] };
const MANUAL_LABEL = { granted: "dada à mão", revoked: "tirada à mão" };
const STAT_LABELS = { xp: "XP", streak: "ofensiva", maxStreak: "maior ofensiva", totalCorrectAnswers: "acertos" };
const PROFILE_LABELS = { nickname: "apelido", email: "e-mail", city: "cidade", showInRanking: "ranking" };
const ACHIEVEMENT_MODE_LABEL = { auto: "automática", granted: "dar", revoked: "tirar" };

/** Prazos de banimento oferecidos (dias; "" = sem prazo; "custom" = digitar). */
const BAN_DURATIONS = [
  ["1", "1 dia"], ["3", "3 dias"], ["7", "7 dias"], ["15", "15 dias"], ["30", "30 dias"], ["90", "90 dias"],
  ["", "Sem prazo (até desbloquear)"], ["custom", "Outro (em dias)"],
];

const formatNumber = (value) => Number(value ?? 0).toLocaleString("pt-BR");

/** "até 12/11/2026 14:30" ou "sem prazo". */
function describeBanEnd(ban) {
  return ban.until ? `até ${formatDateTime(ban.until)}` : "sem prazo";
}

/** Lê um inteiro digitado (aceita "1.000" e "1 000"); null se vazio ou inválido. */
function readWhole(text) {
  const clean = String(text ?? "").replace(/[\s.]/g, "");
  return /^-?\d+$/.test(clean) ? Number(clean) : null;
}

const profileOf = (user) => ({ nickname: user.nickname, email: user.email, city: user.city ?? "", showInRanking: user.showInRanking });
const statsOf = (user) => ({ xp: String(user.xp), streak: String(user.streak), maxStreak: String(user.maxStreak), totalCorrectAnswers: String(user.totalCorrectAnswers) });

/**
 * Janela que pede o motivo (vai para a auditoria). Usada uma vez ao salvar as alterações, e no banir/zerar.
 * No banimento, também pede o prazo (o motivo aparece para o usuário).
 */
function ReasonDialog({ title, summary, withBan, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("7");
  const [customDays, setCustomDays] = useState(7);
  const { run, busy, message } = useAction();
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      const durationDays = duration === "custom" ? Number(customDays) : duration ? Number(duration) : null;
      await onConfirm({ reason, durationDays });
      onClose();
    });
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {summary?.length > 0 && (
          <div>
            <p className="muted">Vai mudar:</p>
            <ul className="import-list">{summary.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        )}
        {withBan && (
          <div className="form__row">
            <Field label="Prazo do banimento" hint="Quando vence, a conta volta a funcionar sozinha.">
              <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                {BAN_DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {duration === "custom" && (
              <Field label="Dias">
                <input type="number" min={1} max={3650} step={1} value={customDays} onChange={(e) => setCustomDays(e.target.value)} required />
              </Field>
            )}
          </div>
        )}
        <Field label="Motivo" hint={withBan ? "Aparece para o usuário quando ele tentar entrar, e fica na auditoria." : "Vale para todas as alterações acima e fica na auditoria."}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required autoFocus />
        </Field>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>{busy ? "Salvando…" : "Confirmar"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Perfil: apelido, e-mail, cidade e se aparece no ranking (só muda o rascunho; salva no fim). */
function ProfileCard({ user, draft, onChange, editable }) {
  const set = (change) => onChange({ ...draft, ...change });
  return (
    <div className="card">
      <h2 className="card__title">Perfil</h2>
      <div className="form__row">
        <Field label="Apelido"><input value={draft.nickname} disabled={!editable} maxLength={60} onChange={(e) => set({ nickname: e.target.value })} /></Field>
        <Field label="E-mail"><input type="email" value={draft.email} disabled={!editable} maxLength={254} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Cidade"><input value={draft.city} disabled={!editable} maxLength={60} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="Ranking">
          <label className="check">
            <input type="checkbox" checked={draft.showInRanking} disabled={!editable} onChange={(e) => set({ showInRanking: e.target.checked })} />
            Aparece no ranking
          </label>
        </Field>
      </div>
      <p className="muted">
        Id público: <code>{user.publicId}</code> · Conta criada: {formatDateTime(user.createdAt)} · Último login: {formatDateTime(user.lastLogin)}
      </p>
    </div>
  );
}

/** Números do progresso (valores exatos, sem limite) e "somar/tirar XP". */
function StatsCard({ user, draft, onChange, delta, onDelta, editable }) {
  const set = (change) => onChange({ ...draft, ...change });
  const fields = [
    ["xp", "XP total", `Nível ${user.level.level} (${user.level.title})`],
    ["streak", "Ofensiva atual (dias)", "Vale a partir de hoje."],
    ["maxStreak", "Maior ofensiva (dias)", "Nunca fica abaixo da atual."],
    ["totalCorrectAnswers", "Acertos", "Conta para as conquistas de acertos."],
  ];
  const invalid = Object.values(draft).some((text) => readWhole(text) === null || readWhole(text) < 0);
  return (
    <div className="card">
      <h2 className="card__title">Progresso</h2>
      <div className="stat-edit">
        {fields.map(([field, label, hint]) => (
          <Field key={field} label={label} hint={hint}>
            <input inputMode="numeric" value={draft[field]} disabled={!editable} onChange={(e) => set({ [field]: e.target.value })} />
          </Field>
        ))}
      </div>
      {invalid && <p className="field__error">Use números inteiros de 0 para cima.</p>}
      {editable && (
        <div className="xp-adjust">
          <Field label="Somar ou tirar XP" hint="Sem limite. Use negativo para tirar (o XP não fica abaixo de 0).">
            <input inputMode="numeric" placeholder="ex.: 5000 ou -250" value={delta} onChange={(e) => onDelta(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

/** Atividades da trilha, por módulo: concluir (com nota) ou desmarcar (só no rascunho; salva no fim). */
function ActivitiesCard({ user, draft, onChange, editable }) {
  return (
    <div className="card">
      <h2 className="card__title">Atividades ({user.completedActivities.length} concluídas)</h2>
      <p className="muted">Concluir uma atividade libera as seguintes na trilha. A nota fica como a melhor nota da pessoa.</p>
      {user.modules.map((module) => (
        <details key={module.id} className="module-group" open={module.status !== "locked" || module.completedActivities > 0}>
          <summary>
            <strong>{module.title}</strong> · {module.completedActivities}/{module.totalActivities}
            {module.status === "completed" && <> <Badge tone="ok">Módulo concluído</Badge></>}
          </summary>
          {module.activities.length === 0 ? (
            <p className="muted">Sem atividades.</p>
          ) : (
            <table className="table">
              <tbody>
                {module.activities.map((activity) => {
                  const pending = draft[activity.id];
                  const completed = pending ? pending.completed : activity.status === "completed";
                  const score = pending?.bestScore ?? String(activity.bestScore ?? 100);
                  const [tone, label] = ACTIVITY_STATUS[activity.status] ?? ["neutral", activity.status];
                  const update = (next) => {
                    const original = { completed: activity.status === "completed", bestScore: String(activity.bestScore ?? 100) };
                    const merged = { completed, bestScore: score, ...next };
                    const unchanged = merged.completed === original.completed && (!merged.completed || merged.bestScore === original.bestScore);
                    const copy = { ...draft };
                    if (unchanged) delete copy[activity.id];
                    else copy[activity.id] = merged;
                    onChange(copy);
                  };
                  return (
                    <tr key={activity.id} className={pending ? "row--pending" : undefined}>
                      <td>{activity.order}. {activity.title}</td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                        {activity.bestScore !== null && <span className="muted"> · {activity.bestScore}%</span>}
                        {pending && <div className="field__hint">→ {pending.completed ? `concluir com ${pending.bestScore}%` : "desmarcar"}</div>}
                      </td>
                      {editable && (
                        <td>
                          <span className="table__actions">
                            <label className="check">
                              <input type="checkbox" checked={completed} onChange={(e) => update({ completed: e.target.checked })} />
                              Concluída
                            </label>
                            {completed && (
                              <>
                                <input
                                  className="score-input"
                                  inputMode="numeric"
                                  aria-label={`Nota de ${activity.title}`}
                                  value={score}
                                  onChange={(e) => update({ bestScore: e.target.value })}
                                />
                                <span className="muted">%</span>
                              </>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </details>
      ))}
    </div>
  );
}

/** Conquistas: automática (pela meta), dar ou tirar (só no rascunho; salva no fim). */
function AchievementsCard({ user, draft, onChange, editable }) {
  const unlocked = user.achievements.filter((achievement) => achievement.unlocked).length;
  return (
    <div className="card">
      <h2 className="card__title">Conquistas ({unlocked}/{user.achievements.length})</h2>
      <table className="table">
        <thead><tr><th>Conquista</th><th>Progresso</th><th>Situação</th>{editable && <th>Ajuste</th>}</tr></thead>
        <tbody>
          {user.achievements.map((achievement) => {
            const saved = achievement.manual ?? "auto";
            const value = draft[achievement.id] ?? saved;
            return (
              <tr key={achievement.id} className={draft[achievement.id] ? "row--pending" : undefined}>
                <td><strong>{achievement.title}</strong><div className="field__hint">{achievement.description}</div></td>
                <td><Num value={achievement.current} />/<Num value={achievement.goal} /></td>
                <td>
                  {achievement.unlocked ? <Badge tone="ok">Desbloqueada</Badge> : <Badge>Bloqueada</Badge>}
                  {achievement.manual && <div className="field__hint">{MANUAL_LABEL[achievement.manual]}</div>}
                  {achievement.unlockedAt && <div className="field__hint">{formatDateTime(achievement.unlockedAt)}</div>}
                </td>
                {editable && (
                  <td>
                    <select
                      aria-label={`Ajuste da conquista ${achievement.title}`}
                      value={value}
                      onChange={(e) => {
                        const copy = { ...draft };
                        if (e.target.value === saved) delete copy[achievement.id];
                        else copy[achievement.id] = e.target.value;
                        onChange(copy);
                      }}
                    >
                      <option value="auto">Automática (pela meta)</option>
                      <option value="granted">Dar</option>
                      <option value="revoked">Tirar</option>
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Usuário do app: editar perfil, números do progresso (XP sem limite), atividades e conquistas. As edições ficam
 * pendentes e são gravadas juntas em "Salvar alterações", que pede o motivo uma vez só (vai para a auditoria).
 * Banir e zerar o progresso são ações separadas e pedem o motivo na hora.
 */
export function UserDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api(`/users/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  const [saved, setSaved] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const user = data?.user;
  const editable = can("manage");

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [delta, setDelta] = useState("");
  const [activities, setActivities] = useState({});
  const [achievements, setAchievements] = useState({});

  const resetDrafts = () => {
    if (!user) return;
    setProfile(profileOf(user));
    setStats(statsOf(user));
    setDelta("");
    setActivities({});
    setAchievements({});
  };
  useEffect(resetDrafts, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /** O que mudou em relação ao que está salvo: lista para o resumo e as chamadas à API. */
  const pending = useMemo(() => {
    if (!user || !profile || !stats) return { lines: [], steps: [], invalid: false };
    const lines = [];
    const steps = [];
    let invalid = false;

    const savedProfile = profileOf(user);
    const profileChanges = Object.fromEntries(Object.entries(profile).filter(([field, value]) => value !== savedProfile[field]));
    if (Object.keys(profileChanges).length) {
      lines.push(`Perfil: ${Object.keys(profileChanges).map((field) => PROFILE_LABELS[field]).join(", ")}`);
      steps.push((reason) => api(`/users/${id}/profile`, { method: "PATCH", body: { ...profileChanges, reason } }));
    }

    const statChanges = {};
    for (const [field, text] of Object.entries(stats)) {
      const value = readWhole(text);
      if (value === null || value < 0) invalid = true;
      else if (value !== user[field]) statChanges[field] = value;
    }
    if (Object.keys(statChanges).length) {
      lines.push(Object.entries(statChanges).map(([field, value]) => `${STAT_LABELS[field]}: ${formatNumber(user[field])} → ${formatNumber(value)}`).join(" · "));
      steps.push((reason) => api(`/users/${id}/stats`, { method: "PATCH", body: { ...statChanges, reason } }));
    }

    if (delta.trim()) {
      const value = readWhole(delta);
      if (value === null) invalid = true;
      else if (value !== 0) {
        lines.push(value > 0 ? `Dar ${formatNumber(value)} XP` : `Tirar ${formatNumber(-value)} XP`);
        steps.push((reason) => api(`/users/${id}/xp`, { method: "POST", body: { delta: value, reason } }));
      }
    }

    const titles = new Map(user.modules.flatMap((module) => module.activities.map((activity) => [activity.id, activity.title])));
    for (const [activityId, change] of Object.entries(activities)) {
      const score = readWhole(change.bestScore);
      if (change.completed && (score === null || score < 0 || score > 100)) {
        invalid = true;
        continue;
      }
      lines.push(change.completed ? `Concluir "${titles.get(activityId)}" (${score}%)` : `Desmarcar "${titles.get(activityId)}"`);
      steps.push((reason) =>
        api(`/users/${id}/activities/${activityId}`, { method: "PUT", body: change.completed ? { completed: true, bestScore: score, reason } : { completed: false, reason } }));
    }

    const achievementTitles = new Map(user.achievements.map((achievement) => [achievement.id, achievement.title]));
    for (const [key, mode] of Object.entries(achievements)) {
      lines.push(`Conquista "${achievementTitles.get(key)}": ${ACHIEVEMENT_MODE_LABEL[mode]}`);
      steps.push((reason) => api(`/users/${id}/achievements/${key}`, { method: "PUT", body: { mode, reason } }));
    }
    return { lines, steps, invalid };
  }, [user, profile, stats, delta, activities, achievements, id]);

  const dirty = pending.lines.length > 0;

  // Sair da página com alterações não salvas pede confirmação do navegador.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const saveAll = () =>
    setDialog({
      title: "Salvar alterações",
      summary: pending.lines,
      run: async ({ reason }) => {
        // Uma de cada vez, na ordem: se uma falhar, as anteriores já valeram e a mensagem mostra qual parou.
        for (const step of pending.steps) await step(reason);
        setSaved({ type: "ok", text: `${pending.lines.length} ${pending.lines.length === 1 ? "alteração salva" : "alterações salvas"}.` });
      },
    });

  return (
    <section className={dirty ? "has-savebar" : undefined}>
      <p><Link to="/usuarios">← Usuários</Link></p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {user && profile && stats && (
        <>
          <div className="toolbar">
            <h1>{user.nickname} {user.status === "blocked" && <Badge tone="danger">Banido</Badge>}</h1>
            <span className="table__actions">
              <button className="button button--ghost" onClick={() => setPreviewing(true)}>Ver como no app</button>
            {editable && (
              <>
                {user.status === "blocked" ? (
                  <button className="button button--ghost" onClick={() => setDialog({ title: "Desbloquear usuário", run: ({ reason }) => api(`/users/${id}/status`, { method: "PATCH", body: { status: "active", reason } }) })}>
                    Desbloquear
                  </button>
                ) : (
                  <button className="button button--ghost" onClick={() => setDialog({ title: "Banir usuário", withBan: true, run: ({ reason, durationDays }) => api(`/users/${id}/status`, { method: "PATCH", body: { status: "blocked", reason, durationDays } }) })}>
                    Banir
                  </button>
                )}
                <button
                  className="button button--danger"
                  onClick={() =>
                    confirmAction("Zerar todo o progresso deste usuário? XP, ofensiva, atividades e tentativas serão apagados.", { destructive: true }) &&
                    setDialog({ title: "Zerar progresso", run: ({ reason }) => api(`/users/${id}/reset-progress`, { method: "POST", body: { reason } }) })
                  }
                >
                  Zerar progresso
                </button>
              </>
            )}
            </span>
          </div>
          {user.ban && (
            <div className="notice notice--error">
              <strong>Conta banida {describeBanEnd(user.ban)}.</strong> Motivo: {user.ban.reason || "—"}
              {user.ban.bannedAt && <> · aplicado em {formatDateTime(user.ban.bannedAt)}</>}
            </div>
          )}
          <Notice message={saved} />

          <div className="user-edit">
            <ProfileCard user={user} draft={profile} onChange={setProfile} editable={editable} />
            <StatsCard user={user} draft={stats} onChange={setStats} delta={delta} onDelta={setDelta} editable={editable} />
          </div>
          <ActivitiesCard user={user} draft={activities} onChange={setActivities} editable={editable} />
          <AchievementsCard user={user} draft={achievements} onChange={setAchievements} editable={editable} />

          <div className="card">
            <h2 className="card__title">Últimas tentativas</h2>
            <table className="table">
              <tbody>
                {user.recentAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{attempt.activityTitle}</td>
                    <td>{ATTEMPT_STATUS[attempt.status]}</td>
                    <td>{attempt.score === null ? "—" : `${attempt.score}%`}</td>
                    <td>{attempt.xpEarned === null ? "" : <>+<Num value={attempt.xpEarned} suffix=" XP" /></>}</td>
                    <td>{formatDateTime(attempt.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && dirty && (
            <div className="savebar" role="region" aria-label="Alterações não salvas">
              <span>
                <strong>{pending.lines.length} {pending.lines.length === 1 ? "alteração não salva" : "alterações não salvas"}</strong>
                {pending.invalid && <span className="field__error"> · corrija os campos inválidos</span>}
              </span>
              <span className="table__actions">
                <button type="button" className="button button--ghost" onClick={resetDrafts}>Desfazer</button>
                <button type="button" className="button" disabled={pending.invalid} onClick={saveAll}>Salvar alterações</button>
              </span>
            </div>
          )}
        </>
      )}
      {previewing && user && <AppProfilePreview user={user} onClose={() => setPreviewing(false)} />}
      {dialog && (
        <ReasonDialog
          title={dialog.title}
          summary={dialog.summary}
          withBan={dialog.withBan}
          onClose={() => setDialog(null)}
          onConfirm={async (values) => {
            try {
              await dialog.run(values);
            } finally {
              reload();
            }
            if (!dialog.summary) setSaved({ type: "ok", text: `Feito: ${dialog.title}.` });
          }}
        />
      )}
    </section>
  );
}
