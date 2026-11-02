import { api } from "../api.js";
import { LoadState, formatDateTime, useLoad } from "../components/ui.jsx";

/** Um número em destaque. */
function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

/** Tela inicial: números gerais e eventos em andamento. */
export function DashboardPage() {
  const { data, error, loading, reload } = useLoad(() => api("/stats"), []);
  return (
    <section>
      <h1>Início</h1>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <h2>Usuários</h2>
          <div className="stats">
            <Stat label="contas" value={data.users.total} />
            <Stat label="estudaram nos últimos 7 dias" value={data.users.studiedThisWeek} />
            <Stat label="novas nos últimos 7 dias" value={data.users.newThisWeek} />
            <Stat label="bloqueadas" value={data.users.blocked} />
            <Stat label="atividades concluídas (7 dias)" value={data.activity.finishedAttemptsThisWeek} />
          </div>
          <h2>Conteúdo publicado</h2>
          <div className="stats">
            <Stat label="módulos" value={data.content.modules} />
            <Stat label="atividades" value={data.content.activities} />
            <Stat label="sinais no dicionário" value={data.content.signs} hint={`${data.content.unreviewedSigns} com glosa não revisada`} />
            <Stat label="conquistas" value={data.content.achievements} />
            <Stat label="versão do conteúdo" value={data.contentVersion} hint="sobe a cada alteração" />
          </div>
          <h2>Eventos em andamento</h2>
          {data.activeEvents.length === 0 ? (
            <p className="muted">Nenhum evento de XP valendo agora.</p>
          ) : (
            <ul className="plain-list">
              {data.activeEvents.map((event) => (
                <li key={event.id}>
                  <strong>{event.title}</strong> — {event.multiplier}x XP até {formatDateTime(event.endsAt)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
