import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon.jsx";
import { LogoHand } from "../../components/illustrations.jsx";
import { glossExists, loadVLibras, placePanelOver, playGloss, replayLastSign, setPanelVisible } from "./vlibras-player.js";
import "./sign-avatar.css";

const SLOW_LOAD_HINT_MS = 15000;
const PANEL_WAIT_INTERVAL_MS = 250;

/**
 * Mantém o painel do VLibras e a capa de carregamento sobre o quadro (ResizeObserver + rolagem).
 * @param {React.RefObject<HTMLElement>} frameRef - quadro de referência.
 * @param {React.RefObject<HTMLElement>} coverRef - capa de carregamento.
 * @param {boolean} active - false quando o avatar está indisponível.
 * @param {boolean} hidden - esconde o painel (ex.: algo por cima do quadro).
 */
function useKeepOverFrame(frameRef, coverRef, active, hidden) {
  useEffect(() => {
    const frame = frameRef.current;
    if (!active || !frame) return undefined;
    let lastCoverPlacement = "";
    let lastPanelPlacement = "";
    let scheduledFrame = 0;

    const place = () => {
      scheduledFrame = 0;
      const rect = frame.getBoundingClientRect();
      const placement = [rect.left, rect.top, rect.width, rect.height].map(Math.round).join();
      const cover = coverRef.current;
      if (cover && placement !== lastCoverPlacement) {
        lastCoverPlacement = placement;
        Object.assign(cover.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      if (placement !== lastPanelPlacement && placePanelOver(rect)) {
        lastPanelPlacement = placement;
        setPanelVisible(!hidden);
      }
    };
    const schedulePlacement = () => {
      if (!scheduledFrame) scheduledFrame = requestAnimationFrame(place);
    };

    const resizeObserver = new ResizeObserver(schedulePlacement);
    resizeObserver.observe(frame);
    resizeObserver.observe(document.body);
    window.addEventListener("scroll", schedulePlacement, { capture: true, passive: true });
    window.addEventListener("resize", schedulePlacement);
    const waitForPanel = setInterval(() => {
      if (lastPanelPlacement) clearInterval(waitForPanel);
      else schedulePlacement();
    }, PANEL_WAIT_INTERVAL_MS);

    schedulePlacement();
    setPanelVisible(!hidden);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", schedulePlacement, { capture: true });
      window.removeEventListener("resize", schedulePlacement);
      clearInterval(waitForPanel);
      cancelAnimationFrame(scheduledFrame);
    };
  }, [frameRef, coverRef, active, hidden]);
}

/**
 * Capa do app por cima do painel do VLibras enquanto ele carrega: o usuário vê "Preparando o sinal…"
 * em vez da tela de carregamento do widget. Fica no <body> (portal) para ficar acima do painel,
 * que é desenhado fora da árvore do React. O painel continua visível por baixo, como o Chrome exige.
 */
const LoadingCover = ({ coverRef, visible, slow, onSkip }) =>
  createPortal(
    <div ref={coverRef} className={`sign-loading${visible ? "" : " sign-loading--done"}`} role="status" aria-hidden={!visible}>
      <span className="sign-loading__hand" aria-hidden="true">
        <LogoHand size={44} color="#fff" />
      </span>
      <p className="sign-loading__title">Preparando o sinal…</p>
      <span className="sign-loading__dots" aria-hidden="true"><i /><i /><i /></span>
      {slow && visible && (
        <>
          <p className="sign-loading__hint">Na primeira vez pode levar até um minuto.</p>
          <button type="button" className="sign-loading__skip" onClick={onSkip}>
            Continuar sem o avatar
          </button>
        </>
      )}
    </div>,
    document.body,
  );

/**
 * Quadro mostrado quando o avatar não aparece (sem detalhes técnicos), com "Tentar de novo".
 */
function UnavailableFrame({ skipped, onRetry }) {
  return (
    <div className="sign-frame sign-frame--unavailable" role="img" aria-label="Sinal indisponível no momento">
      <span className="sign-frame__icon" aria-hidden="true">
        <Icon name="hand" size={40} strokeWidth={1.5} />
      </span>
      <p className="sign-frame__message">
        {skipped ? "Você seguiu sem o avatar." : "Não foi possível mostrar o sinal agora."}
      </p>
      <button type="button" className="sign-frame__retry" onClick={onRetry}>
        <Icon name="replay" size={16} /> {skipped ? "Mostrar o avatar" : "Tentar de novo"}
      </button>
    </div>
  );
}

/**
 * Barra fora da atividade: aviso de glosa não revisada, crédito do VLibras e "Ver de novo".
 */
function AvatarInfoBar({ reviewed, ready }) {
  return (
    <div className="sign-avatar__bar">
      {!reviewed && (
        <span className="sign-avatar__warning" title="Ainda não conferido por pessoa fluente em Libras">
          não revisado
        </span>
      )}
      <span className="sign-avatar__credit">VLibras</span>
      <button type="button" className="sign-avatar__replay" onClick={replayLastSign} disabled={!ready}>
        <Icon name="replay" size={14} /> Ver de novo
      </button>
    </div>
  );
}

/**
 * Quadro com o avatar do VLibras fazendo um sinal, com capa de carregamento e falha amigável.
 * @param {{avatar: {gloss: string, reviewed: boolean}, hidden?: boolean, compact?: boolean}} props
 *   compact = só o quadro (atividade); sem compact mostra a barra de crédito (dicionário, revisão).
 * Usado por: ActivityPage, SignDialog (dicionário, assistente, resultado).
 */
export function SignAvatar({ avatar, hidden = false, compact = false }) {
  const frameRef = useRef(null);
  const coverRef = useRef(null);
  const skippedRef = useRef(false);
  const [status, setStatus] = useState("loading");
  const [skipped, setSkipped] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (status !== "loading") return undefined;
    setIsSlow(false);
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOAD_HINT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status === "unavailable") setPanelVisible(false);
  }, [status]);

  useEffect(() => {
    let active = true;
    if (skippedRef.current) {
      setStatus("unavailable");
      return undefined;
    }
    setStatus("loading");

    (async () => {
      try {
        if (!(await glossExists(avatar.gloss))) throw new Error(`glosa ${avatar.gloss} fora do dicionário do VLibras`);
        await loadVLibras();
        if (!active || skippedRef.current) return;
        setStatus("ready");
        playGloss(avatar.gloss);
      } catch (error) {
        if (!active) return;
        console.warn("Avatar VLibras indisponível:", error.message);
        setStatus("unavailable");
      }
    })();
    return () => {
      active = false;
    };
  }, [avatar.gloss, retryCount]);

  useKeepOverFrame(frameRef, coverRef, status !== "unavailable", hidden);
  useEffect(() => () => setPanelVisible(false), []);

  function continueWithoutAvatar() {
    skippedRef.current = true;
    setSkipped(true);
    setStatus("unavailable");
  }

  function retry() {
    skippedRef.current = false;
    setSkipped(false);
    setRetryCount((count) => count + 1);
  }

  if (status === "unavailable") return <UnavailableFrame skipped={skipped} onRetry={retry} />;

  return (
    <div className="sign-avatar">
      <div ref={frameRef} className="sign-frame" role="img" aria-label="Avatar do VLibras fazendo um sinal em Libras" />
      <LoadingCover coverRef={coverRef} visible={status === "loading" && !hidden} slow={isSlow} onSkip={continueWithoutAvatar} />
      {!compact && <AvatarInfoBar reviewed={avatar.reviewed} ready={status === "ready"} />}
    </div>
  );
}
