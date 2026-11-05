import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, formatDateTime, useAction, useLoad } from "../components/ui.jsx";

const ATTEMPT_STATUS = { finished: "concluída", in_progress: "em andamento", expired: "expirada" };

/** Prazos de banimento oferecidos (dias; "" = sem prazo; "custom" = digitar). */
const BAN_DURATIONS = [
  ["1", "1 dia"], ["3", "3 dias"], ["7", "7 dias"], ["15", "15 dias"], ["30", "30 dias"], ["90", "90 dias"],
  ["", "Sem prazo (até desbloquear)"], ["custom", "Outro (em dias)"],
];

/** "até 12/11/2026 14:30" ou "sem prazo". */
function describeBanEnd(ban) {
  return ban.until ? `até ${formatDateTime(ban.until)}` : "sem prazo";
}

/** Janela de ação com motivo obrigatório (vai para a auditoria; no banimento, aparece também para o usuário). */
function ReasonDialog({ title, withDelta, withBan, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [delta, setDelta] = useState(0);
  const [duration, setDuration] = useState("7");
  const [customDays, setCustomDays] = useState(7);
  const { run, busy, message } = useAction();
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      const durationDays = duration === "custom" ? Number(customDays) : duration ? Number(duration) : null;
      await onConfirm({ reason, delta: Number(delta), durationDays });
      onClose();
    });
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {withDelta && (
          <Field label="XP a somar (use negativo para tirar)">
            <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required />
          </Field>
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
        <Field label="Motivo" hint={withBan ? "Aparece para o usuário quando ele tentar entrar, e fica na auditoria." : "Fica registrado na auditoria."}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
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

/** Detalhe de um usuário: progresso, conquistas, tentativas e moderação (bloquear, XP, zerar). */
export function UserDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api(`/users/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  const user = data?.user;

  const actions = {
    block: {
      title: "Banir usuário",
      withBan: true,
      run: ({ reason, durationDays }) => api(`/users/${id}/status`, { method: "PATCH", body: { status: "blocked", reason, durationDays } }),
    },
    unblock: { title: "Desbloquear usuário", run: ({ reason }) => api(`/users/${id}/status`, { method: "PATCH", body: { status: "active", reason } }) },
    xp: { title: "Ajustar XP", withDelta: true, run: ({ reason, delta }) => api(`/users/${id}/xp`, { method: "POST", body: { delta, reason } }) },
    reset: { title: "Zerar progresso", run: ({ reason }) => api(`/users/${id}/reset-progress`, { method: "POST", body: { reason } }) },
  };

  return (
    <section>
      <p><Link to="/usuarios">← Usuários</Link></p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {user && (
        <>
          <div className="toolbar">
            <h1>{user.nickname} {user.status === "blocked" && <Badge tone="danger">Banido</Badge>}</h1>
            {can("manage") && (
              <span className="table__actions">
                {user.status === "blocked"
                  ? <button className="button button--ghost" onClick={() => setDialog("unblock")}>Desbloquear</button>
                  : <button className="button button--ghost" onClick={() => setDialog("block")}>Banir</button>}
                <button className="button button--ghost" onClick={() => setDialog("xp")}>Ajustar XP</button>
                <button className="button button--danger" onClick={() => confirmAction("Zerar todo o progresso deste usuário? XP, ofensiva, atividades e tentativas serão apagados.") && setDialog("reset")}>
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
          <div className="card details">
            <p><strong>E-mail:</strong> {user.email}</p>
            <p><strong>Id público:</strong> {user.publicId}</p>
            <p><strong>Cidade:</strong> {user.city || "—"} · <strong>Aparece no ranking:</strong> {user.showInRanking ? "sim" : "não"}</p>
            <p><strong>Conta criada:</strong> {formatDateTime(user.createdAt)} · <strong>Último login:</strong> {formatDateTime(user.lastLogin)}</p>
            <p><strong>XP:</strong> {user.xp} · <strong>Nível:</strong> {user.level.level} ({user.level.title})</p>
            <p><strong>Ofensiva:</strong> {user.streak} dias (máxima {user.maxStreak}) · <strong>Acertos:</strong> {user.totalCorrectAnswers}</p>
          </div>
          <h2>Conquistas</h2>
          <ul className="chips">
            {user.achievements.map((achievement) => (
              <li key={achievement.id} className={achievement.unlocked ? "chip chip--on" : "chip"}>
                {achievement.title} · {achievement.current}/{achievement.goal}
              </li>
            ))}
          </ul>
          <h2>Atividades concluídas ({user.completedActivities.length})</h2>
          <table className="table">
            <tbody>
              {user.completedActivities.map((entry) => (
                <tr key={entry.activityId}><td>{entry.title}</td><td>melhor nota {entry.bestScore}%</td><td>{formatDateTime(entry.completedAt)}</td></tr>
              ))}
            </tbody>
          </table>
          <h2>Últimas tentativas</h2>
          <table className="table">
            <tbody>
              {user.recentAttempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{attempt.activityTitle}</td>
                  <td>{ATTEMPT_STATUS[attempt.status]}</td>
                  <td>{attempt.score === null ? "—" : `${attempt.score}%`}</td>
                  <td>{attempt.xpEarned === null ? "" : `+${attempt.xpEarned} XP`}</td>
                  <td>{formatDateTime(attempt.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {dialog && (
        <ReasonDialog
          title={actions[dialog].title}
          withDelta={actions[dialog].withDelta}
          withBan={actions[dialog].withBan}
          onClose={() => setDialog(null)}
          onConfirm={async (values) => {
            await actions[dialog].run(values);
            reload();
          }}
        />
      )}
    </section>
  );
}
