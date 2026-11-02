import { Navigate, useNavigate, useParams } from "react-router-dom";
import * as TrailApi from "../../api/api-trail.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { BottomNav, ErrorState, LoadingState } from "../../components/layout.jsx";
import { Icon } from "../../components/Icon.jsx";
import { EventBanner } from "../../components/EventBanner.jsx";
import { TrailIcon } from "../../components/trail-icons.jsx";
import { StatusPill, TimelineNode, TrailHeader, percentOf, useOpenWithAnimation } from "./trail-parts.jsx";
import "./trail.css";

/**
 * Cartão de unidade (protótipo "modulo alta 3"). 1º toque seleciona (borda roxa e botão "Continuar");
 * 2º toque, ou "Continuar", abre a atividade com animação.
 */
function UnitCard({ activity, selected, opening, onTap, onOpen }) {
  const locked = activity.status === "locked";
  const current = activity.status === "available";
  const description = locked ? "Conclua a unidade anterior para desbloquear" : activity.description;
  const statusText = locked ? "bloqueada" : current ? "em andamento" : "concluída, refazer";
  return (
    <li className={`trail-item trail-item--${activity.status}${opening ? " trail-item--opening" : ""}`}>
      <TimelineNode status={activity.status} />
      <div className={`trail-card trail-card--unit${selected ? " trail-card--current" : ""}`}>
        <button
          type="button"
          className="trail-card__open"
          onClick={() => onTap(activity)}
          disabled={locked}
          aria-pressed={selected}
          aria-label={`${activity.order}. ${activity.title}: ${statusText}${selected ? ". Toque de novo para abrir" : ""}`}
        />
        <span className="trail-card__icon" aria-hidden="true"><TrailIcon title={activity.title} /></span>
        <span className="trail-card__body">
          <span className="trail-card__title">{activity.order}.{"\u00a0"}{activity.title}</span>
          <StatusPill status={activity.status} />
          {description && <span className="trail-card__description">{description}</span>}
          {selected && (
            <button type="button" className="trail-card__continue" onClick={() => onOpen(activity)}>
              {current ? "Continuar" : "Refazer"} <Icon name="chevronRight" size={14} strokeWidth={2.6} />
            </button>
          )}
        </span>
        {!selected && <Icon name="chevronRight" size={22} strokeWidth={2.2} />}
      </div>
    </li>
  );
}

/**
 * Unidades de um módulo (protótipo "modulo alta 3"): progresso do módulo e as atividades em ordem, com a linha
 * do tempo (verde até onde foi concluído). Tocar numa unidade liberada seleciona; tocar de novo abre a atividade.
 * Um módulo ainda sem atividades (ex.: "Treino com a câmera") mostra "em breve" e o atalho para a câmera.
 */
export function ModulePage() {
  const { moduleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedId, openingId, tap, openWithAnimation } = useOpenWithAnimation();
  const { data, error, loading, reload } = useAsyncData(TrailApi.fetchTrail);
  const goBack = () => navigate("/trilha");

  // Enquanto carrega (ou se falhar), o cabeçalho e a navegação continuam na tela, como na trilha.
  if (loading || error) {
    return (
      <div className="screen screen--with-nav trail-screen">
        <TrailHeader user={user} onBack={goBack} title="Módulo" percent={0} progressLabel="Progresso no módulo" />
        <main className="trail-content">
          {loading ? <LoadingState message="Carregando o módulo…" /> : <ErrorState message={error.message} onRetry={reload} />}
        </main>
        <BottomNav />
      </div>
    );
  }

  const modules = data.modules;
  const position = modules.findIndex((module) => module.id === moduleId);
  const module = modules[position];
  if (!module || module.status === "locked") return <Navigate to="/trilha" replace />;

  const activityPath = (activity) => `/atividade/${activity.id}?modulo=${module.id}`;

  return (
    <div className="screen screen--with-nav trail-screen">
      <TrailHeader
        user={user}
        onBack={goBack}
        title={`Módulo ${position + 1} • ${module.title}`}
        percent={percentOf(module.completedActivities, module.totalActivities)}
        progressLabel={`Progresso no módulo ${module.title}`}
      />
      <EventBanner />
      <main className="trail-content">
        <h2 className="trail-section-title">Unidades</h2>
        {module.activities.length === 0 ? (
          <div className="trail-empty">
            <p>Este módulo ainda não tem atividades. Em breve!</p>
            <p>Enquanto isso, pratique o alfabeto com a câmera.</p>
            <button type="button" className="button-primary" onClick={() => navigate("/camera")}>Abrir a câmera</button>
          </div>
        ) : (
          <ol className="trail-list trail-list--units">
            {module.activities.map((activity) => (
              <UnitCard
                key={activity.id}
                activity={activity}
                selected={selectedId === activity.id}
                opening={openingId === activity.id}
                onTap={(tapped) => tap(tapped.id, activityPath(tapped))}
                onOpen={(opened) => openWithAnimation(opened.id, activityPath(opened))}
              />
            ))}
          </ol>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
