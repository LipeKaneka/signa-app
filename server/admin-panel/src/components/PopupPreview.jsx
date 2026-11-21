import logoColorida from "../assets/brand/logo-colorida.svg";
import tipografiaColorida from "../assets/brand/tipografia-colorida.svg";

/**
 * Prévia do pop-up como aparece no app (mesmo modelo do Figma: logo, linha, título, texto, quadro roxo e botão).
 * Atualiza enquanto o formulário é editado. secondary = texto pequeno embaixo do botão (ex.: "Depois").
 */
export function PopupPreview({ title, message, notesTitle, notes, buttonText, secondary }) {
  return (
    <div className="popup-preview" aria-label="Prévia do pop-up no app">
      <div className="popup-preview__card">
        <div className="popup-preview__brand">
          <img src={logoColorida} alt="" />
          <img src={tipografiaColorida} alt="Signa Ludus" />
        </div>
        <hr className="popup-preview__line" />
        <p className="popup-preview__title">{title || "Título"}</p>
        {message && <p className="popup-preview__message">{message}</p>}
        {notes && (
          <div className="popup-preview__notes">
            {notesTitle && <strong>{notesTitle}</strong>}
            <p>{notes}</p>
          </div>
        )}
        <span className="popup-preview__button">{buttonText || "Botão"}</span>
        {secondary && <span className="popup-preview__secondary">{secondary}</span>}
      </div>
    </div>
  );
}
