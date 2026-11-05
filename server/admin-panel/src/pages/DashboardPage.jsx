import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, LoadState, formatDateTime, useLoad } from "../components/ui.jsx";
import { AreaChart, Sparkline, StackedBar } from "../components/charts.jsx";
import { PanelIcon } from "../components/icons.jsx";

const PERIODS = [7, 30, 90];
const number = (value) => (value ?? 0).toLocaleString("pt-BR");
const percent = (value) => (value === null || value === undefined ? "—" : `${value}%`);

/** Indicadores do topo: valor do período, variação contra o período anterior e a tendência por dia. */
const KPIS = [
  { key: "activeUsers", label: "Pessoas ativas", hint: "concluíram ao menos 1 atividade", series: "activeUsers", format: number },
  { key: "newUsers", label: "Novos cadastros", series: "newUsers", format: number },
  { key: "finishedAttempts", label: "Atividades concluídas", series: "finishedAttempts", format: number },
  { key: "accuracy", label: "Taxa de acerto", hint: "respostas certas / respondidas", series: "accuracy", format: percent },
  { key: "passRate", label: "Aprovação", hint: "tentativas com a nota mínima", format: percent },
  { key: "xpEarned", label: "XP distribuído", series: "xpEarned", format: number },
];

/** Métricas que o gráfico principal pode mostrar. */
const CHART_METRICS = [
  { key: "finishedAttempts", label: "Atividades concluídas", format: number },
  { key: "activeUsers", label: "Pessoas ativas", format: number },
  { key: "newUsers", label: "Cadastros", format: number },
  { key: "xpEarned", label: "XP", format: number },
];

/** Verbo de cada ação da auditoria (service-audit.js). */
const ACTION_LABELS = {
  create: "criou", update: "alterou", delete: "excluiu", reorder: "reordenou", reset: "restaurou o padrão",
  login: "entrou", logout: "saiu", login_failed: "errou a senha", seed: "rodou o seed", export: "exportou",
  adjust_xp: "ajustou XP", reset_progress: "zerou o progresso", change_password: "trocou a senha", reset_password: "redefiniu a senha",
};

function ChangeBadge({ change }) {
  if (change === null || change === undefined) {
    return <span className="kpi__change kpi__change--flat" title="Sem dados no período anterior para comparar">—</span>;
  }
  const up = change >= 0;
  return (
    <span className={`kpi__change ${up ? "kpi__change--up" : "kpi__change--down"}`}>
      <PanelIcon name={up ? "arrowUp" : "arrowDown"} size={12} /> {Math.abs(change)}%
    </span>
  );
}

function KpiCard({ kpi, data, days }) {
  const value = data.kpis[kpi.key];
  const series = kpi.series ? data.series.map((point) => point[kpi.series] ?? 0) : [];
  return (
    <article className="kpi">
      <p className="kpi__label">{kpi.label}</p>
      <p className="kpi__value">{kpi.format(value.value)}</p>
      <div className="kpi__footer">
        <ChangeBadge change={value.change} />
        <Sparkline values={series} />
      </div>
      <p className="kpi__hint">{kpi.hint ? `${kpi.hint} · ` : ""}vs. {days} dias anteriores</p>
    </article>
  );
}

/**
 * Dashboard: indicadores do período (7, 30 ou 90 dias) com comparação, gráfico diário escolhendo a métrica,
 * funil da trilha, desempenho por atividade, perguntas mais difíceis, cadastros e alterações recentes,
 * e o resumo do conteúdo publicado.
 */
export function DashboardPage() {
  const { can } = useAuth();
  const [days, setDays] = useState(30);
  const [metricKey, setMetricKey] = useState("finishedAttempts");
  const analytics = useLoad(() => api("/analytics", { query: { days } }), [days]);
  const stats = useLoad(() => api("/stats"), []);
  const data = analytics.data;
  const metric = CHART_METRICS.find((item) => item.key === metricKey);

  return (
    <section className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Como o app está sendo usado e onde os alunos têm mais dificuldade.</p>
        </div>
        <div className="page-header__actions">
          <div className="segmented" role="group" aria-label="Período">
            {PERIODS.map((period) => (
              <button key={period} type="button" className={period === days ? "segmented__on" : ""} aria-pressed={period === days} onClick={() => setDays(period)}>
                {period} dias
              </button>
            ))}
          </div>
          <button type="button" className="button button--ghost button--icon" onClick={() => { analytics.reload(); stats.reload(); }} aria-label="Atualizar os dados" title="Atualizar">
            <PanelIcon name="refresh" size={18} />
          </button>
        </div>
      </div>

      <LoadState loading={analytics.loading && !data} error={analytics.error} onRetry={analytics.reload} />
      {data && (
        <div className={analytics.loading ? "is-refreshing" : ""}>
          <div className="kpi-grid">
            {KPIS.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} data={data} days={data.days} />)}
          </div>

          <div className="card card--chart">
            <div className="card__header">
              <h2>Evolução diária</h2>
              <select value={metricKey} onChange={(event) => setMetricKey(event.target.value)} aria-label="Métrica do gráfico" className="select--compact">
                {CHART_METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <AreaChart data={data.series} valueKey={metric.key} label={metric.label} format={metric.format} />
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card__header">
                <h2>Funil da trilha</h2>
                <span className="muted small">de {number(data.totals.users)} contas</span>
              </div>
              {data.funnel.length === 0 && <p className="muted">Nenhum módulo ativo.</p>}
              {data.funnel.map((module) => (
                <StackedBar
                  key={module.id}
                  label={module.title}
                  primary={module.started}
                  secondary={module.completed}
                  total={module.totalUsers}
                  primaryLabel="começaram"
                  secondaryLabel={module.activities ? "concluíram" : undefined}
                />
              ))}
              <p className="legend"><i className="legend__primary" /> começaram (1+ atividade) <i className="legend__secondary" /> concluíram o módulo</p>
            </div>

            <div className="card">
              <div className="card__header">
                <h2>Perguntas mais difíceis</h2>
                <span className="muted small">mín. 5 respostas</span>
              </div>
              {data.hardestQuestions.length === 0 ? (
                <p className="muted">Ainda não há respostas suficientes neste período.</p>
              ) : (
                <ol className="rank-list">
                  {data.hardestQuestions.map((question, index) => (
                    <li key={`${question.activity}-${index}`}>
                      <div>
                        <strong>{question.answer || question.prompt}</strong>
                        <span className="muted small">{question.activity} · {question.answers} respostas{question.type === "camera_sign" ? " · câmera" : ""}</span>
                      </div>
                      <Badge tone={question.accuracy < 50 ? "danger" : "warn"}>{question.accuracy}% de acerto</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <h2>Desempenho por atividade</h2>
              <span className="muted small">últimos {data.days} dias</span>
            </div>
            {data.activityPerformance.length === 0 ? (
              <p className="muted">Nenhuma atividade concluída neste período.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Atividade</th><th>Módulo</th><th className="num">Tentativas</th><th className="num">Pessoas</th><th>Nota média</th><th className="num">Aprovação</th></tr>
                  </thead>
                  <tbody>
                    {data.activityPerformance.map((activity) => (
                      <tr key={activity.id}>
                        <td><strong>{activity.title}</strong></td>
                        <td className="muted">{activity.module}</td>
                        <td className="num">{activity.attempts}</td>
                        <td className="num">{activity.users}</td>
                        <td>
                          <div className="meter" role="img" aria-label={`Nota média ${activity.averageScore}`}>
                            <div className="meter__fill" style={{ width: `${activity.averageScore}%` }} />
                            <span>{activity.averageScore}</span>
                          </div>
                        </td>
                        <td className="num"><Badge tone={activity.passRate >= 70 ? "ok" : activity.passRate >= 40 ? "warn" : "danger"}>{activity.passRate}%</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card__header">
                <h2>Cadastros recentes</h2>
                <Link to="/usuarios" className="small">Ver usuários</Link>
              </div>
              <ul className="activity-feed">
                {data.recentUsers.map((user) => (
                  <li key={user.publicId}>
                    <span className="avatar avatar--small" aria-hidden="true">{user.nickname.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{user.nickname}</strong><span className="muted small">{formatDateTime(user.createdAt)}</span></div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <div className="card__header">
                <h2>Alterações no painel</h2>
                {can("manage") && <Link to="/auditoria" className="small">Ver auditoria</Link>}
              </div>
              {data.recentChanges.length === 0 ? (
                <p className="muted">Nenhuma alteração registrada.</p>
              ) : (
                <ul className="activity-feed">
                  {data.recentChanges.map((change, index) => (
                    <li key={`${change.createdAt}-${index}`}>
                      <span className="avatar avatar--small avatar--muted" aria-hidden="true"><PanelIcon name="audit" size={14} /></span>
                      <div>
                        <span><strong>{change.adminEmail ?? "sistema"}</strong> {ACTION_LABELS[change.action] ?? change.action} — {change.summary || change.entity}</span>
                        <span className="muted small">{formatDateTime(change.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {stats.data && (
        <div className="card">
          <div className="card__header"><h2>Conteúdo publicado</h2><span className="muted small">versão {stats.data.contentVersion}</span></div>
          <div className="summary-grid">
            <div><strong>{stats.data.content.modules}</strong><span>módulos</span></div>
            <div><strong>{stats.data.content.activities}</strong><span>atividades</span></div>
            <div><strong>{stats.data.content.signs}</strong><span>sinais ({stats.data.content.unreviewedSigns} com glosa não revisada)</span></div>
            <div><strong>{stats.data.content.achievements}</strong><span>conquistas</span></div>
            <div><strong>{stats.data.users.blocked}</strong><span>contas bloqueadas</span></div>
          </div>
          {stats.data.activeEvents.length > 0 && (
            <p className="event-strip">
              <PanelIcon name="events" size={16} /> Evento valendo agora: {stats.data.activeEvents.map((event) => `${event.title} (${event.multiplier}x XP até ${formatDateTime(event.endsAt)})`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
