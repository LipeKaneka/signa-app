import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { useExitAnimation } from "../../hooks/useExitAnimation.js";
import { MOVEMENT_LETTERS, SENSITIVITIES } from "../../features/translator/useSignTranslator.js";

const MODES = [
  { id: "translate", label: "Traduzir" },
  { id: "practice", label: "Praticar letras" },
];

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="drawer-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? "drawer-segmented__option--active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Gaveta lateral da câmera: modo, texto traduzido, sensibilidade e o que é reconhecido. */
export function TranslatorDrawer({ mode, onModeChange, sensitivity, onSensitivityChange, translator, samples, profile, onClose }) {
  const staticLetters = [...new Set(samples.map((sample) => sample.rotulo))].sort().join(" ");
  const sensitivityOptions = Object.entries(SENSITIVITIES).map(([id, item]) => ({ id, label: item.label }));
  // Fecha deslizando: o fundo esmaece e a gaveta sai; só desmonta quando o esmaecer termina.
  const { leaving, startLeaving: startClosing, handleAnimationEnd } = useExitAnimation(onClose);

  return (
    <div
      className={`drawer-backdrop${leaving ? " drawer-backdrop--leaving" : ""}`}
      onClick={startClosing}
      onAnimationEnd={handleAnimationEnd}
    >
      <aside className="translator-drawer" onClick={(event) => event.stopPropagation()} aria-label="Opções do tradutor">
        <button type="button" className="icon-button translator-drawer__close" onClick={startClosing} aria-label="Fechar">
          <Icon name="close" size={20} />
        </button>

        <h2>Sua mão</h2>
        <p className="translator-drawer__info">
          {profile
            ? `✋ Mão analisada em ${new Date(profile.criadoEm).toLocaleDateString("pt-BR")}`
            : "✋ Mão ainda não analisada"}
        </p>
        <div className="translator-drawer__links">
          <Link to="/camera/analise">{profile ? "Refazer análise" : "Analisar minha mão"}</Link>
          <Link to="/camera/ensinar">Ensinar sinal</Link>
        </div>

        <h2>Modo</h2>
        <SegmentedControl label="Modo da câmera" options={MODES} value={mode} onChange={onModeChange} />

        <h2>Tradução</h2>
        <p className={`translator-drawer__text${translator.text ? "" : " muted"}`}>
          {translator.text || "Letras e palavras reconhecidas aparecem aqui…"}
        </p>
        <div className="translator-drawer__actions">
          <button type="button" onClick={translator.textActions.addSpace}>Espaço</button>
          <button type="button" onClick={translator.textActions.deleteLast}>⌫ Apagar</button>
          <button type="button" onClick={translator.textActions.clear}>Limpar</button>
          <button type="button" onClick={translator.textActions.speak} disabled={!translator.text.trim()}>Ouvir</button>
        </div>

        <h2>Sensibilidade</h2>
        <SegmentedControl label="Sensibilidade do reconhecimento" options={sensitivityOptions} value={sensitivity} onChange={onSensitivityChange} />

        <h2>O que é reconhecido</h2>
        <p className="translator-drawer__info"><b>Letras paradas:</b> {staticLetters}</p>
        <p className="translator-drawer__info">
          <b>Letras com movimento:</b>{" "}
          {translator.taughtGestureLetters.length
            ? translator.taughtGestureLetters.join(" ")
            : `nenhuma ensinada neste aparelho (${MOVEMENT_LETTERS.join(", ")})`}
        </p>
        <p className="translator-drawer__info">
          <b>Palavras:</b>{" "}
          {translator.wordModel
            ? translator.wordModel.sinais.filter((sign) => !sign.experimental).map((sign) => sign.palavra).join(" · ")
            : translator.wordModelError
              ? "indisponível no momento"
              : "carregando…"}
        </p>
        {translator.wordModel?.sinais.some((sign) => sign.experimental) && (
          <p className="translator-drawer__info">
            <b>Palavras experimentais</b> (aprendidas só com o Dicionário do INES; podem errar mais):{" "}
            {translator.wordModel.sinais.filter((sign) => sign.experimental).map((sign) => sign.palavra).join(" · ")}
          </p>
        )}

        <p className="translator-drawer__note">
          🔒 Tudo é processado no seu aparelho; nenhuma imagem é enviada. Letras: “Brazilian Sign Language Alphabet”
          (UNIVALI, MIT/CC BY 4.0), “benchmarking-libras” (Luca Villela, MIT) e projeto de Maycon Pacheco (MIT).
          Palavras: MINDS-Libras (UFMG, CC BY 4.0) e Dicionário da Libras do INES (uso educacional).
        </p>
      </aside>
    </div>
  );
}
