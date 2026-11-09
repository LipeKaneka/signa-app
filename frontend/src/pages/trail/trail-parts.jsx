import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { Flame, LogoHand, XpBarVertical } from "../../components/illustrations.jsx";
import { prefersReducedMotion } from "../../utils/motion.js";
import { formatCompact, formatFull } from "../../utils/format-number.js";

/** Duração da animação do cartão tocado antes de trocar de tela (igual a .trail-item--opening no CSS). */
const OPEN_ANIMATION_MS = 280;

/**
 * Toque em módulo ou unidade em dois passos: o 1º toque seleciona o cartão (fica roxo); o 2º no mesmo cartão
 * abre com animação (o cartão "pulsa" e só então a tela troca). Tocar em outro cartão muda a seleção.
 * Toques durante a animação são ignorados; sem animação quando o aparelho pede menos movimento.
 * @returns {{selectedId: string|null, openingId: string|null, tap: (id: string, to: string) => void,
 *   openWithAnimation: (id: string, to: string) => void}}
 * Usado por: TrailPage (módulos) e ModulePage (unidades).
 */
export function useOpenWithAnimation() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const openWithAnimation = (id, to) => {
    if (openingId) return;
    setSelectedId(id);
    if (prefersReducedMotion()) return navigate(to);
    setOpeningId(id);
    timerRef.current = setTimeout(() => navigate(to), OPEN_ANIMATION_MS);
  };
  const tap = (id, to) => {
    if (openingId) return;
    if (selectedId === id) openWithAnimation(id, to);
    else setSelectedId(id);
  };
  return { selectedId, openingId, tap, openWithAnimation };
}

/** Pílula de situação dos cartões da trilha (protótipo: verde, amarela e cinza). */
const STATUS_PILLS = {
  completed: { label: "Concluído", tone: "done" },
  available: { label: "Em andamento", tone: "doing" },
  locked: { label: "Bloqueado", tone: "locked" },
};

export function StatusPill({ status, tone }) {
  const pill = STATUS_PILLS[status];
  return <span className={`trail-pill trail-pill--${tone ?? pill.tone}`}>{pill.label}</span>;
}

/** Porcentagem inteira de concluídas (0 quando não há nada). */
export function percentOf(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** Barra verde com a porcentagem à direita (cabeçalhos da trilha e do módulo). */
export function TrailProgress({ percent, label }) {
  return (
    <div className="trail-progress">
      <div className="trail-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
        <div className="trail-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="trail-progress__value">{percent}%</span>
    </div>
  );
}

/** Selo "XP" do cabeçalho (desenho do protótipo: termômetro com o selo XP). */
/**
 * Cabeçalho roxo arredondado: logo, ofensiva (D = dias) e XP (P = pontos), título e progresso.
 * onBack = seta de voltar antes da marca (tela das unidades, com o título à esquerda). Ofensiva e XP aparecem nas duas telas.
 */
export function TrailHeader({ user, title, percent, progressLabel, onBack }) {
  return (
    <header className={`trail-header${onBack ? " trail-header--module" : ""}`}>
      <div className="trail-header__row">
        {onBack && (
          <button type="button" className="icon-button trail-header__back" onClick={onBack} aria-label="Voltar para os módulos">
            <Icon name="back" size={26} strokeWidth={2.2} />
          </button>
        )}
        <span className="trail-header__brand">
          <LogoHand size={30} color="#fff" />
          <span>Signa</span>
        </span>
        <span className="trail-header__stats">
          <span className="trail-header__stat" title={`${formatFull(user.streak)} dias seguidos`}>
            <span className="trail-header__icon"><Flame size={26} /></span>
            {formatCompact(user.streak)}<small>D</small>
          </span>
          <span className="trail-header__stat" title={`${formatFull(user.xp)} pontos de XP`}>
            <span className="trail-header__icon"><XpBarVertical size={40} /></span>
            {formatCompact(user.xp)}<small>P</small>
          </span>
        </span>
      </div>
      <h1 className="trail-header__title">{title}</h1>
      <TrailProgress percent={percent} label={progressLabel} />
    </header>
  );
}

/** Marcador da linha do tempo à esquerda dos cartões: ✓ concluído, ▶ em andamento, cadeado bloqueado. */
export function TimelineNode({ status }) {
  if (status === "completed") {
    return (
      <span className="timeline-node timeline-node--completed" aria-hidden="true">
        <Icon name="check" size={9} strokeWidth={3.4} />
      </span>
    );
  }
  if (status === "locked") {
    return (
      <span className="timeline-node timeline-node--locked" aria-hidden="true">
        <svg width="7" height="8" viewBox="0 0 7 8"><rect x="0.5" y="3.4" width="6" height="4.2" rx="0.8" fill="currentColor" /><path d="M1.8 3.6V2.4a1.7 1.7 0 0 1 3.4 0v1.2" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
      </span>
    );
  }
  return (
    <span className="timeline-node timeline-node--current" aria-hidden="true">
      <svg width="6" height="7" viewBox="0 0 6 7"><path d="M0.6 0.4 L5.6 3.5 L0.6 6.6 Z" fill="currentColor" /></svg>
    </span>
  );
}

/** Linha tracejada em curva entre os cartões de módulo (decorativa, alternando o lado). */
export function DashedConnector({ flip }) {
  return (
    <svg className={`dashed-connector${flip ? " dashed-connector--flip" : ""}`} viewBox="0 0 120 110" preserveAspectRatio="none" aria-hidden="true">
      <path d="M50 2 C 40 40, 0 40, 20 62 S 100 52, 92 108" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="8 6" strokeLinecap="round" />
    </svg>
  );
}
