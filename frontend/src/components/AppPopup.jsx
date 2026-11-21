import logoColorida from "../assets/brand/logo-colorida.svg";
import tipografiaColorida from "../assets/brand/tipografia-colorida.svg";
import "./app-popup.css";

/**
 * Modelo único dos pop-ups do app (desenho do Figma): logo Signa Ludus, linha, título, texto, quadro roxo com
 * título ("Novidades") e botão roxo grande. Usado pelos três tipos: avisos, manutenção e atualizações.
 * O cartão é sempre branco (também no tema escuro), como no Figma.
 * @param {{title: string, message?: string, notesTitle?: string, notes?: string, primaryLabel: string,
 *   onPrimary: () => void, secondaryLabel?: string, onSecondary?: () => void, footnote?: string}} props
 * Usado por: AppPopups (features/popups).
 */
export function AppPopup({ title, message, notesTitle, notes, primaryLabel, onPrimary, secondaryLabel, onSecondary, footnote }) {
  return (
    <div className="app-popup" role="alertdialog" aria-modal="true" aria-labelledby="app-popup-title" aria-describedby="app-popup-body">
      <div className="app-popup__card">
        <div className="app-popup__brand">
          <img className="app-popup__hand" src={logoColorida} alt="" />
          <img className="app-popup__name" src={tipografiaColorida} alt="Signa Ludus" />
        </div>
        <hr className="app-popup__line" />
        <h2 id="app-popup-title" className="app-popup__title">{title}</h2>
        <div id="app-popup-body" className="app-popup__body">
          {message && <p className="app-popup__message">{message}</p>}
          {notes && (
            <div className="app-popup__notes">
              {notesTitle && <strong>{notesTitle}</strong>}
              <p>{notes}</p>
            </div>
          )}
        </div>
        <button type="button" className="app-popup__button" onClick={onPrimary} autoFocus>{primaryLabel}</button>
        {secondaryLabel && <button type="button" className="app-popup__secondary" onClick={onSecondary}>{secondaryLabel}</button>}
        {footnote && <p className="app-popup__footnote">{footnote}</p>}
      </div>
    </div>
  );
}
