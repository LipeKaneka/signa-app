import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, formatDateTime, useAction, useLoad } from "../components/ui.jsx";

const ATTEMPT_STATUS = { finished: "concluída", in_progress: "em andamento", expired: "expirada" };
const ACTIVITY_STATUS = { completed: ["ok", "Concluída"], available: ["warn", "Liberada"], locked: ["neutral", "Bloqueada"] };
const MANUAL_LABEL = { granted: "dada à mão", revoked: "tirada à mão" };

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

/**
 * Janela que pede o motivo (vai para a auditoria) antes de aplicar qualquer mudança no usuário.
 * No banimento, também pede o prazo (o motivo aparece para o usuário).
 */
function ReasonDialog({ title, description, withBan, onClose, onConfirm }) {
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
        {description && <p className="muted">{description}</p>}
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
        <Field label="Motivo" hint={withBan ? "Aparece para o usuário quando ele tentar entrar, e fica na auditoria." : "Fica registrado na auditoria."}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required autoFocus />
        </Field>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Confirmar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Perfil: apelido, e-mail, cidade e se aparece no ranking. */
function ProfileCard({ user, editable, ask }) {
  const initial = { nickname: user.nickname, email: user.email, city: user.city ?? "", showInRanking: user.showInRanking };
  const [form, setForm] = useState(initial);
  useEffect(() => setForm({ nickname: user.nickname, email: user.email, city: user.city ?? "", showInRanking: user.showInRanking }), [user]);
  const changes = Object.fromEntries(Object.entries(form).filter(([field, value]) => value !== initial[field]));
  const dirty = Object.keys(changes).length > 0;
  const set = (change) => setForm((current) => ({ ...current, ...change }));

  return (
    <div className="card">
      <h2 className="card__title">Perfil</h2>
      <div className="form__row">
        <Field label="Apelido"><input value={form.nickname} disabled={!editable} maxLength={60} onChange={(e) => set({ nickname: e.target.value })} /></Field>
        <Field label="E-mail"><input type="email" value={form.email} disabled={!editable} maxLength={254} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Cidade"><input value={form.city} disabled={!editable} maxLength={60} onChange={(e) => set({ city: e.target.value })} /></Field>
        <Field label="Ranking">
          <label className="check">
            <input type="checkbox" checked={form.showInRanking} disabled={!editable} onChange={(e) => set({ showInRanking: e.target.checked })} />
            Aparece no ranking
          </label>
        </Field>
      </div>
      <p className="muted">
        Id público: <code>{user.publicId}</code> · Conta criada: {formatDateTime(user.createdAt)} · Último login: {formatDateTime(user.lastLogin)}
      </p>
      {editable && (
        <div className="form__actions">
          {dirty && <button type="button" className="button button--ghost" onClick={() => setForm(initial)}>Desfazer</button>}
          <button
            type="button"
            className="button"
            disabled={!dirty}
            onClick={() => ask({ title: "Salvar perfil", run: ({ reason }) => api(`/users/${user.id}/profile`, { method: "PATCH", body: { ...changes, reason } }) })}
          >
            Salvar perfil
          </button>
        </div>
      )}
    </div>
  );
}

/** Números do progresso: valores exatos (sem limite) e "somar/tirar XP". */
function StatsCard({ user, editable, ask }) {
  const initial = { xp: String(user.xp), streak: String(user.streak), maxStreak: String(user.maxStreak), totalCorrectAnswers: String(user.totalCorrectAnswers) };
  const [form, setForm] = useState(initial);
  const [delta, setDelta] = useState("");
  useEffect(() => {
    setForm({ xp: String(user.xp), streak: String(user.streak), maxStreak: String(user.maxStreak), totalCorrectAnswers: String(user.totalCorrectAnswers) });
  }, [user]);

  const parsed = Object.fromEntries(Object.entries(form).map(([field, text]) => [field, readWhole(text)]));
  const invalid = Object.values(parsed).some((value) => value === null || value < 0);
  const changes = Object.fromEntries(Object.entries(parsed).filter(([field, value]) => value !== Number(initial[field])));
  const dirty = Object.keys(changes).length > 0;
  const deltaValue = readWhole(delta);
  const set = (change) => setForm((current) => ({ ...current, ...change }));

  const fields = [
    ["xp", "XP total", `Nível ${user.level.level} (${user.level.title})`],
    ["streak", "Ofensiva atual (dias)", "Vale a partir de hoje."],
    ["maxStreak", "Maior ofensiva (dias)", "Nunca fica abaixo da atual."],
    ["totalCorrectAnswers", "Acertos", "Conta para as conquistas de acertos."],
  ];

  return (
    <div className="card">
      <h2 className="card__title">Progresso</h2>
      <div className="stat-edit">
        {fields.map(([field, label, hint]) => (
          <Field key={field} label={label} hint={hint}>
            <input inputMode="numeric" value={form[field]} disabled={!editable} onChange={(e) => set({ [field]: e.target.value })} />
          </Field>
        ))}
      </div>
      {invalid && <p className="field__error">Use números inteiros de 0 para cima.</p>}
      {editable && (
        <>
          <div className="form__actions">
            {dirty && <button type="button" className="button button--ghost" onClick={() => setForm(initial)}>Desfazer</button>}
            <button
              type="button"
              className="button"
              disabled={!dirty || invalid}
              onClick={() => ask({ title: "Salvar progresso", run: ({ reason }) => api(`/users/${user.id}/stats`, { method: "PATCH", body: { ...changes, reason } }) })}
            >
              Salvar números
            </button>
          </div>
          <div className="xp-adjust">
            <Field label="Somar ou tirar XP" hint="Sem limite. Use negativo para tirar (o XP não fica abaixo de 0).">
              <input inputMode="numeric" placeholder="ex.: 5000 ou -250" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </Field>
            <button
              type="button"
              className="button button--ghost"
              disabled={!deltaValue}
              onClick={() =>
                ask({
                  title: deltaValue > 0 ? `Dar ${formatNumber(deltaValue)} XP` : `Tirar ${formatNumber(-deltaValue)} XP`,
                  run: async ({ reason }) => {
                    await api(`/users/${user.id}/xp`, { method: "POST", body: { delta: deltaValue, reason } });
                    setDelta("");
                  },
                })
              }
            >
              Aplicar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Atividades da trilha, por módulo: marcar como concluída (com nota) ou tirar a conclusão. */
function ActivitiesCard({ user, editable, ask }) {
  const [scores, setScores] = useState({});
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
                  const [tone, label] = ACTIVITY_STATUS[activity.status] ?? ["neutral", activity.status];
                  const score = scores[activity.id] ?? String(activity.bestScore ?? 100);
                  const scoreValue = readWhole(score);
                  const scoreValid = scoreValue !== null && scoreValue >= 0 && scoreValue <= 100;
                  return (
                    <tr key={activity.id}>
                      <td>{activity.order}. {activity.title}</td>
                      <td><Badge tone={tone}>{label}</Badge>{activity.bestScore !== null && <span className="muted"> · {activity.bestScore}%</span>}</td>
                      {editable && (
                        <td>
                          <span className="table__actions">
                            <input
                              className="score-input"
                              inputMode="numeric"
                              aria-label={`Nota de ${activity.title}`}
                              value={score}
                              onChange={(e) => setScores((current) => ({ ...current, [activity.id]: e.target.value }))}
                            />
                            <span className="muted">%</span>
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              disabled={!scoreValid}
                              onClick={() =>
                                ask({
                                  title: `${activity.status === "completed" ? "Trocar a nota de" : "Concluir"} "${activity.title}"`,
                                  run: ({ reason }) =>
                                    api(`/users/${user.id}/activities/${activity.id}`, { method: "PUT", body: { completed: true, bestScore: scoreValue, reason } }),
                                })
                              }
                            >
                              {activity.status === "completed" ? "Salvar nota" : "Concluir"}
                            </button>
                            {activity.status === "completed" && (
                              <button
                                type="button"
                                className="button button--ghost button--small"
                                onClick={() =>
                                  ask({
                                    title: `Tirar a conclusão de "${activity.title}"`,
                                    description: "As atividades e módulos que dependem dela podem voltar a ficar bloqueados.",
                                    run: ({ reason }) => api(`/users/${user.id}/activities/${activity.id}`, { method: "PUT", body: { completed: false, reason } }),
                                  })
                                }
                              >
                                Desmarcar
                              </button>
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

/** Conquistas: automática (pela meta), dada à mão ou tirada à mão. */
function AchievementsCard({ user, editable, ask }) {
  const unlocked = user.achievements.filter((achievement) => achievement.unlocked).length;
  return (
    <div className="card">
      <h2 className="card__title">Conquistas ({unlocked}/{user.achievements.length})</h2>
      <table className="table">
        <thead><tr><th>Conquista</th><th>Progresso</th><th>Situação</th>{editable && <th>Ajuste</th>}</tr></thead>
        <tbody>
          {user.achievements.map((achievement) => (
            <tr key={achievement.id}>
              <td><strong>{achievement.title}</strong><div className="field__hint">{achievement.description}</div></td>
              <td>{formatNumber(achievement.current)}/{formatNumber(achievement.goal)}</td>
              <td>
                {achievement.unlocked ? <Badge tone="ok">Desbloqueada</Badge> : <Badge>Bloqueada</Badge>}
                {achievement.manual && <div className="field__hint">{MANUAL_LABEL[achievement.manual]}</div>}
                {achievement.unlockedAt && <div className="field__hint">{formatDateTime(achievement.unlockedAt)}</div>}
              </td>
              {editable && (
                <td>
                  <select
                    aria-label={`Ajuste da conquista ${achievement.title}`}
                    value={achievement.manual ?? "auto"}
                    onChange={(e) => {
                      const mode = e.target.value;
                      const titles = { auto: "Voltar ao automático", granted: "Dar a conquista", revoked: "Tirar a conquista" };
                      ask({
                        title: `${titles[mode]}: ${achievement.title}`,
                        description: mode === "auto" ? "Ela passa a valer pela meta normal." : undefined,
                        run: ({ reason }) => api(`/users/${user.id}/achievements/${achievement.id}`, { method: "PUT", body: { mode, reason } }),
                      });
                    }}
                  >
                    <option value="auto">Automática (pela meta)</option>
                    <option value="granted">Dar</option>
                    <option value="revoked">Tirar</option>
                  </select>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Usuário do app: editar perfil, números do progresso (XP sem limite), atividades e conquistas, além de banir e zerar.
 * Toda mudança pede um motivo e vai para a auditoria.
 */
export function UserDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api(`/users/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  const [saved, setSaved] = useState("");
  const user = data?.user;
  const editable = can("manage");

  /** Abre a janela do motivo; ao confirmar, aplica e recarrega o usuário. */
  const ask = (action) => setDialog(action);

  return (
    <section>
      <p><Link to="/usuarios">← Usuários</Link></p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {user && (
        <>
          <div className="toolbar">
            <h1>{user.nickname} {user.status === "blocked" && <Badge tone="danger">Banido</Badge>}</h1>
            {editable && (
              <span className="table__actions">
                {user.status === "blocked" ? (
                  <button className="button button--ghost" onClick={() => ask({ title: "Desbloquear usuário", run: ({ reason }) => api(`/users/${id}/status`, { method: "PATCH", body: { status: "active", reason } }) })}>
                    Desbloquear
                  </button>
                ) : (
                  <button className="button button--ghost" onClick={() => ask({ title: "Banir usuário", withBan: true, run: ({ reason, durationDays }) => api(`/users/${id}/status`, { method: "PATCH", body: { status: "blocked", reason, durationDays } }) })}>
                    Banir
                  </button>
                )}
                <button
                  className="button button--danger"
                  onClick={() =>
                    confirmAction("Zerar todo o progresso deste usuário? XP, ofensiva, atividades e tentativas serão apagados.", { destructive: true }) &&
                    ask({ title: "Zerar progresso", run: ({ reason }) => api(`/users/${id}/reset-progress`, { method: "POST", body: { reason } }) })
                  }
                >
                  Zerar progresso
                </button>
              </span>
            )}
          </div>
          {user.ban && (
            <div className="notice notice--error">
              <strong>Conta banida {describeBanEnd(user.ban)}.</strong> Motivo: {user.ban.reason || "—"}
              {user.ban.bannedAt && <> · aplicado em {formatDateTime(user.ban.bannedAt)}</>}
            </div>
          )}
          <Notice message={saved} />

          <div className="user-edit">
            <ProfileCard user={user} editable={editable} ask={ask} />
            <StatsCard user={user} editable={editable} ask={ask} />
          </div>
          <ActivitiesCard user={user} editable={editable} ask={ask} />
          <AchievementsCard user={user} editable={editable} ask={ask} />

          <div className="card">
            <h2 className="card__title">Últimas tentativas</h2>
            <table className="table">
              <tbody>
                {user.recentAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{attempt.activityTitle}</td>
                    <td>{ATTEMPT_STATUS[attempt.status]}</td>
                    <td>{attempt.score === null ? "—" : `${attempt.score}%`}</td>
                    <td>{attempt.xpEarned === null ? "" : `+${formatNumber(attempt.xpEarned)} XP`}</td>
                    <td>{formatDateTime(attempt.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {dialog && (
        <ReasonDialog
          title={dialog.title}
          description={dialog.description}
          withBan={dialog.withBan}
          onClose={() => setDialog(null)}
          onConfirm={async (values) => {
            await dialog.run(values);
            setSaved({ type: "ok", text: `Feito: ${dialog.title}.` });
            reload();
          }}
        />
      )}
    </section>
  );
}
