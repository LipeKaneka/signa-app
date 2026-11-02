import { useCallback, useLayoutEffect, useRef, useState } from "react";
import * as ContentApi from "../../api/api-content.js";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { ErrorState, LoadingState, ScreenWithNav } from "../../components/layout.jsx";
import { RankMedal } from "../../components/illustrations.jsx";
import "./ranking.css";

const METRICS = [
  { id: "activities", label: "Atividades", unit: (value) => `${value} ${value === 1 ? "Atividade" : "Atividades"}` },
  { id: "xp", label: "XP", unit: (value) => `${value} XP` },
  { id: "streak", label: "Ofensiva", unit: (value) => `${value} ${value === 1 ? "dia" : "dias"}` },
];

const PODIUM_COLORS = ["#d8b500", "#9a9a9a", "#b06a2c"];
/** Tons de roxo dos quadrados de avatar do protótipo (cada pessoa fica sempre com a mesma cor). */
const AVATAR_COLORS = ["#4f31bb", "#8b7cc8", "#2a2350", "#0c0620", "#9a8fc4", "#6e54d0"];

function pickAvatarColor(publicId) {
  const hash = [...publicId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function PositionChangePill({ change }) {
  if (!change) return null;
  const movedUp = change > 0;
  const amount = Math.abs(change);
  return (
    <span className={`position-pill ${movedUp ? "position-pill--up" : "position-pill--down"}`}>
      <span aria-hidden="true">{movedUp ? "▲" : "▼"}</span> {amount} {amount === 1 ? "Posição" : "Posições"}
      <span className="visually-hidden">{movedUp ? " acima" : " abaixo"} desde a última vez</span>
    </span>
  );
}

/** Quanto falta para passar quem está logo acima. */
function describeGapToNext(ranking, metric) {
  const above = ranking.neighbors.find((row) => row.position === ranking.me.position - 1);
  if (!above) return { text: "Você está no topo!", fraction: 1 };
  const missing = above.value - ranking.me.value + 1;
  const unitText = metric.unit(missing).replace(/^\d+ /, "");
  return {
    text: `${missing === 1 ? "Falta" : "Faltam"} ${missing} ${unitText.toLowerCase()} para subir de rank`,
    fraction: above.value ? Math.min(ranking.me.value / (above.value + 1), 1) : 0,
  };
}

function PositionCard({ ranking, metric }) {
  if (!ranking.me) {
    return (
      <section className="position-card">
        <p className="position-card__label">Você não aparece no ranking.</p>
        <p className="position-card__hint">Ative “Aparecer no ranking” no perfil ou conclua uma atividade.</p>
      </section>
    );
  }
  const gap = describeGapToNext(ranking, metric);
  return (
    <section className="position-card" aria-label="Sua posição">
      <div className="position-card__row">
        <div>
          <p className="position-card__label">Sua Posição</p>
          <strong className="position-card__position">{ranking.me.position}°</strong>
        </div>
        <div className="position-card__pills">
          <PositionChangePill change={ranking.me.positionChange} />
          <span className="position-pill position-pill--best">Melhor: Nº {ranking.me.bestPosition}</span>
        </div>
      </div>
      <div className="position-card__bar"><div style={{ transform: `scaleX(${gap.fraction})` }} /></div>
      <p className="position-card__hint">{gap.text}</p>
    </section>
  );
}

function RankingRow({ row, metric, podium }) {
  const classes = ["ranking-row"];
  if (podium) classes.push("ranking-row--podium");
  if (row.isMe) classes.push("ranking-row--me");
  return (
    <li className={classes.join(" ")}>
      <span className="ranking-row__position">
        {podium ? <RankMedal position={row.position} size={30} color={PODIUM_COLORS[row.position - 1]} /> : `${row.position}°`}
      </span>
      {/* Foto (miniatura 64×64) quando a pessoa tem; senão, o quadrado colorido do protótipo. */}
      <span className="ranking-row__avatar" style={{ background: pickAvatarColor(row.publicId) }} aria-hidden="true">
        {row.avatar && <img src={row.avatar} alt="" />}
      </span>
      <span className="ranking-row__name">{row.isMe ? "Você" : row.nickname}</span>
      <span className="ranking-row__value">{metric.unit(row.value)}</span>
    </li>
  );
}

/** A partir de quantas pessoas a lista ganha rolagem própria (mostra 10 e rola o resto). */
const VISIBLE_ROWS = 10;

/**
 * Com mais de 10 pessoas, a lista fica com a altura das 10 primeiras e rola por dentro (a altura é medida na tela,
 * então funciona com fonte grande). A linha da própria pessoa fica fora, sempre visível no fim.
 */
function useScrollAfterTenthRow(rowCount) {
  const listRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || rowCount <= VISIBLE_ROWS) return setMaxHeight(null);
    const measure = () => {
      const tenth = list.children[VISIBLE_ROWS - 1];
      if (tenth) setMaxHeight(tenth.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop + 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rowCount]);
  return { listRef, scrollStyle: maxHeight ? { maxHeight, overflowY: "auto" } : undefined };
}

/** Todas as pessoas do ranking (pódio com medalha) e, separada no fim, a linha da própria pessoa. */
function RankingList({ ranking, metric }) {
  const me = ranking.me && (ranking.neighbors.find((row) => row.isMe) ?? ranking.top.find((row) => row.isMe));
  const { listRef, scrollStyle } = useScrollAfterTenthRow(ranking.top.length);
  return (
    <>
      <ol
        ref={listRef}
        className={`ranking-list${scrollStyle ? " ranking-list--scroll" : ""}`}
        style={scrollStyle}
        tabIndex={scrollStyle ? 0 : undefined}
        aria-label={scrollStyle ? "Ranking (role para ver mais)" : undefined}
      >
        {ranking.top.map((row) => <RankingRow key={row.publicId} row={row} metric={metric} podium={row.position <= 3} />)}
      </ol>
      {me && (
        <ol className="ranking-list ranking-list--me" aria-label="Sua posição no ranking" start={me.position}>
          <RankingRow row={me} metric={metric} podium={me.position <= 3} />
        </ol>
      )}
    </>
  );
}

/**
 * Ranking por atividades, XP ou ofensiva (GET /ranking), com posição, variação e vizinhos.
 */
export function RankingPage() {
  const [metricId, setMetricId] = useState("activities");
  const metric = METRICS.find((item) => item.id === metricId);
  const loadRanking = useCallback(() => ContentApi.fetchRanking(metricId), [metricId]);
  const { data, error, loading, reload } = useAsyncData(loadRanking, [loadRanking]);

  return (
    <ScreenWithNav title="Ranking" backTo={-1}>
      {data && <PositionCard ranking={data} metric={METRICS.find((item) => item.id === data.metric) ?? metric} />}

      <div className="ranking-tabs" role="tablist" aria-label="Critério do ranking">
        {METRICS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === metricId}
            className={`ranking-tabs__tab${item.id === metricId ? " ranking-tabs__tab--active" : ""}`}
            onClick={() => setMetricId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Ao trocar de aba, a lista anterior fica (apagada) até a nova chegar: a tela não pula. */}
      {loading && !data && <LoadingState />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <div className={`ranking-results${loading ? " ranking-results--loading" : ""}`} aria-busy={loading}>
          <RankingList ranking={data} metric={METRICS.find((item) => item.id === data.metric) ?? metric} />
        </div>
      )}
    </ScreenWithNav>
  );
}
