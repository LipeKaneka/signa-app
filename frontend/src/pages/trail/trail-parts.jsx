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

/** Desenhos em traço (48x48) dos espaços entre os módulos, um tema por módulo. */
const DOODLES = {
  clock: (
    <>
      <circle cx="24" cy="26" r="13" />
      <path d="M24 19 V26 L29.5 29.5" />
      <path d="M11 15.5 A6 6 0 0 1 18.5 8.5 M37 15.5 A6 6 0 0 0 29.5 8.5" />
      <path d="M15 37 L12 41.5 M33 37 L36 41.5" />
    </>
  ),
  chat: (
    <>
      <path d="M8 8 H28 A4 4 0 0 1 32 12 V22 A4 4 0 0 1 28 26 H17 L11 31 V26 H8 A4 4 0 0 1 4 22 V12 A4 4 0 0 1 8 8 Z" />
      <path d="M36 18 H40 A4 4 0 0 1 44 22 V31 A4 4 0 0 1 40 35 H39 V40 L33 35 H25 A4 4 0 0 1 21 31 V30" />
      <circle cx="12" cy="17" r="1.3" className="trail-doodle__fill" />
      <circle cx="18" cy="17" r="1.3" className="trail-doodle__fill" />
      <circle cx="24" cy="17" r="1.3" className="trail-doodle__fill" />
    </>
  ),
  heart: (
    <>
      <path d="M24 40 C 11 31, 6 23, 9.5 16 C 13 9.5, 20.5 10, 24 16 C 27.5 10, 35 9.5, 38.5 16 C 42 23, 37 31, 24 40 Z" />
      <path d="M14.5 17.5 C 15.5 15, 17.5 14, 19.5 14.2" />
    </>
  ),
  pencil: (
    <>
      <path d="M9 37 L12 28 L31 9 L37 15 L18 34 Z" />
      <path d="M12 28 L18 34 M27 13 L33 19" />
      <path d="M17 43 C 21 40, 25 45, 29 42 S 37 44, 41 41" />
    </>
  ),
  book: (
    <>
      <path d="M24 14 C 19 10, 11 10, 6 12 V37 C 11 35, 19 35, 24 39 C 29 35, 37 35, 42 37 V12 C 37 10, 29 10, 24 14 Z" />
      <path d="M24 14 V39" />
    </>
  ),
  star: <path d="M24 7 L28.6 18.6 L41 19.4 L31.4 27.3 L34.5 39.5 L24 32.8 L13.5 39.5 L16.6 27.3 L7 19.4 L19.4 18.6 Z" />,
};

/** Brilho de 4 pontas (centro em 0,0; raio 6). */
const SPARKLE = "M0 -6 C 0.8 -1.2, 1.2 -0.8, 6 0 C 1.2 0.8, 0.8 1.2, 0 6 C -0.8 1.2, -1.2 0.8, -6 0 C -1.2 -0.8, -0.8 -1.2, 0 -6 Z";

/**
 * Decoração dos espaços entre os módulos: um desenho em traço (no estilo da linha tracejada) com o tema do próximo
 * módulo, rodeado de brilhos dourados. Fica do lado livre da linha. Só decoração (escondido do leitor de tela).
 */
export function TrailDoodle({ kind, side = "left" }) {
  return (
    <svg className={`trail-doodle trail-doodle--${side}`} viewBox="0 0 76 120" aria-hidden="true">
      <g className="trail-doodle__art" transform="translate(8 30) scale(1.25)" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {DOODLES[kind] ?? DOODLES.star}
      </g>
      <g className="trail-doodle__sparkles">
        <path d={SPARKLE} transform="translate(68 24)" />
        <path d={SPARKLE} transform="translate(6 22) scale(0.6)" />
        <path d={SPARKLE} transform="translate(66 104) scale(0.75)" />
        <circle cx="12" cy="106" r="2" />
      </g>
    </svg>
  );
}
