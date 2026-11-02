import { useCallback, useEffect, useState } from "react";

/**
 * Carrega dados da API e permite recarregar. Mantém os dados antigos enquanto recarrega.
 * @param {() => Promise<any>} loader
 * @param {unknown[]} deps
 * @returns {{data: any, error: string|null, loading: boolean, reload: () => void}}
 */
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    loader()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error: error.message, loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}

/**
 * Executa uma ação (salvar, excluir...) mostrando "carregando" e a mensagem de erro/sucesso.
 * @returns {{run: (action: () => Promise<any>, successMessage?: string) => Promise<boolean>, busy: boolean, message: object|null, clear: () => void}}
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const run = useCallback(async (action, successMessage) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (successMessage) setMessage({ type: "ok", text: successMessage });
      return true;
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, message, clear: () => setMessage(null) };
}

/** Faixa de aviso (erro em vermelho, sucesso em verde). */
export function Notice({ message }) {
  if (!message) return null;
  return (
    <p className={`notice notice--${message.type}`} role={message.type === "error" ? "alert" : "status"}>
      {message.text}
    </p>
  );
}

/** Estado de carregamento/erro padrão das páginas. */
export function LoadState({ loading, error, onRetry }) {
  if (error) {
    return (
      <div className="notice notice--error" role="alert">
        {error} <button className="link" onClick={onRetry}>Tentar de novo</button>
      </div>
    );
  }
  if (loading) return <p className="muted">Carregando…</p>;
  return null;
}

/** Campo de formulário com rótulo. */
export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** Selo de situação (ativo, desativado, bloqueado...). */
export function Badge({ tone = "neutral", children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** Selo de ativo/desativado. */
export function ActiveBadge({ active }) {
  return active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="off">Desativado</Badge>;
}

/** Janela sobreposta para formulários. Fecha com Esc ou no botão. */
export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Paginação simples. */
export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginação">
      <button className="button button--ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
      <span>Página {page} de {pages}</span>
      <button className="button button--ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</button>
    </nav>
  );
}

/** Data e hora em pt-BR. */
export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

/** Converte Date/ISO para o valor de um <input type="datetime-local"> (hora local). */
export function toLocalInput(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Pede confirmação; para exclusão definitiva, exige digitar EXCLUIR. */
export function confirmAction(text, { destructive = false } = {}) {
  if (!destructive) return window.confirm(text);
  return window.prompt(`${text}\n\nEsta ação não pode ser desfeita. Digite EXCLUIR para confirmar.`) === "EXCLUIR";
}
