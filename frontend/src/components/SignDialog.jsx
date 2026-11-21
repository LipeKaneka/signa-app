import { useEscapeKey } from "../hooks/useEscapeKey.js";
import { Icon } from "./Icon.jsx";
import { SignAvatar } from "../features/vlibras/SignAvatar.jsx";
import "./sign-dialog.css";
import { MESSAGES } from "../config/messages.js";

/**
 * Janela com o avatar fazendo o sinal de uma palavra (fecha com Esc).
 * @param {{word: string, avatar: {gloss, reviewed}|null, description?: string, onClose: () => void}} props
 * Usado por: Dicionário, Assistente e tela de resultado da atividade.
 */
export function SignDialog({ word, avatar, description, onClose }) {
  useEscapeKey(onClose);

  return (
    <div className="sign-dialog" role="dialog" aria-modal="true" aria-label={`Sinal de ${word}`}>
      <div className="sign-dialog__card">
        <button type="button" className="icon-button sign-dialog__close" onClick={onClose} aria-label="Fechar">
          <Icon name="close" size={20} />
        </button>
        <h2 className="sign-dialog__title">{word}</h2>
        {description && <p className="sign-dialog__description">{description}</p>}
        {avatar ? <SignAvatar avatar={avatar} /> : !description && <p className="muted">{MESSAGES.empty.signAvatar}</p>}
      </div>
    </div>
  );
}
