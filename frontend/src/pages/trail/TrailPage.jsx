import { Fragment } from "react";
import * as TrailApi from "../../api/api-trail.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { BottomNav, ErrorState, LoadingState } from "../../components/layout.jsx";
import { Icon } from "../../components/Icon.jsx";
import { EventBanner } from "../../components/EventBanner.jsx";
import { TrailIcon } from "../../components/trail-icons.jsx";
import { DashedConnector, TrailDoodle, StatusPill, TimelineNode, TrailHeader, percentOf, useOpenWithAnimation } from "./trail-parts.jsx";
import "./trail.css";

/**
 * Desenho do espaço antes de cada módulo, escolhido pelo título (módulos novos do painel caem na estrela).
 * Os nomes são as chaves de DOODLES em trail-parts.jsx.
 */
const MODULE_DOODLES = [
  [/rotina|sala de aula|comando/i, "clock"],
  [/intera|pedag|numera/i, "chat"],
  [/conflit|inclus|gest/i, "heart"],
  [/material|materiais|pr[aá]tica|contex/i, "pencil"],
  [/fundament|alfabet|cultura/i, "book"],
];

function doodleForModule(module) {
  return MODULE_DOODLES.find(([pattern]) => pattern.test(module.title))?.[1] ?? "star";
}

/** Situação lida pelo leitor de tela (módulo sem atividades = "em breve"). */
function describeModuleStatus(module, empty) {
  if (module.status === "locked") return "bloqueado, conclua o módulo anterior";
  if (empty) return "em breve";
  return module.status === "completed" ? "concluído" : "em andamento";
}

/**
 * Cartão de módulo (protótipo "index alta 2"): ícone, título numerado, situação, descrição e seta.
 * 1º toque seleciona (borda roxa); 2º toque abre com animação.
 */
function ModuleCard({ module, position, selected, opening, onTap }) {
  const locked = module.status === "locked";
  const empty = module.totalActivities === 0;
  return (
    <li className={`trail-item trail-item--${module.status}${opening ? " trail-item--opening" : ""}`}>
      <TimelineNode status={module.status} />
      <button
        type="button"
        className={`trail-card trail-card--module${selected ? " trail-card--current" : ""}`}
        onClick={() => onTap(module)}
        disabled={locked}
        aria-pressed={selected}
        aria-label={`${position}. ${module.title}: ${describeModuleStatus(module, empty)}${selected ? ". Toque de novo para abrir" : ""}`}
      >
        <span className="trail-card__icon" aria-hidden="true"><TrailIcon title={module.title} /></span>
        <span className="trail-card__body">
          <span className="trail-card__title">{position}.{"\u00a0"}{module.title}</span>
          {!locked && (empty
            ? <span className="trail-pill trail-pill--soon">Em breve</span>
            : <StatusPill status={module.status} tone={module.status === "available" ? "done" : undefined} />)}
          {!locked && module.description && <span className="trail-card__description">{module.description}</span>}
        </span>
        {!locked && <Icon name="chevronRight" size={22} strokeWidth={2.2} />}
      </button>
    </li>
  );
}

/**
 * Trilha (protótipo "index alta 2"): progresso geral e a lista de módulos ligados por linhas tracejadas.
 * Tocar num módulo seleciona; tocar de novo abre as unidades dele. Tudo vem do backend (GET /trail): módulos novos criados no painel
 * aparecem aqui sem atualizar o app. Com evento de XP ativo, mostra a faixa "2x XP".
 */
export function TrailPage() {
  const { user } = useAuth();
  const { selectedId, openingId, tap } = useOpenWithAnimation();
  const { data, error, loading, reload } = useAsyncData(TrailApi.fetchTrail, [], { cacheKey: "trail" });
  const modules = data?.modules ?? [];
  const done = modules.reduce((sum, module) => sum + module.completedActivities, 0);
  const total = modules.reduce((sum, module) => sum + module.totalActivities, 0);

  return (
    <div className="screen screen--with-nav trail-screen">
      <TrailHeader user={user} title="Trilha de LIBRAS" percent={percentOf(done, total)} progressLabel="Progresso na trilha" />
      <EventBanner />
      <main className="trail-content">
        <h2 className="trail-section-title">Módulos</h2>
        {loading && <LoadingState message="Carregando a trilha…" />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        <ol className="trail-list trail-list--modules">
          {modules.map((module, index) => (
            <Fragment key={module.id}>
              {index > 0 && (
                <li className="trail-connector" aria-hidden="true">
                  <DashedConnector flip={index % 2 === 0} />
                  {/* Alterna o lado, sempre no espaço livre ao lado da linha tracejada. */}
                  <TrailDoodle kind={doodleForModule(module)} side={index % 2 === 1 ? "left" : "right"} />
                </li>
              )}
              <ModuleCard
                module={module}
                position={index + 1}
                selected={selectedId === module.id}
                opening={openingId === module.id}
                onTap={(tapped) => tap(tapped.id, `/trilha/modulo/${tapped.id}`)}
              />
            </Fragment>
          ))}
        </ol>
      </main>
      <BottomNav />
    </div>
  );
}
