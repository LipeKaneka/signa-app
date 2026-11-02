import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { LogoHand } from "../../components/illustrations.jsx";
import { readPreference, storePreference } from "../../utils/session-storage.js";
import "./auth.css";

const SEEN_KEY = "onboarding-seen";

/** As três telas de boas-vindas do protótipo ("login alta 10", "9" e "8"). */
const SLIDES = [
  { title: "O que é Libras?", text: "A Língua Brasileira de Sinais é a língua das pessoas surdas no Brasil." },
  { title: "Seu Ritmo", text: "Módulos, unidades e atividades curtas para aprender um pouco todo dia." },
  { title: "Pratique com a câmera", text: "Faça o sinal na frente da câmera e receba feedback na hora." },
];

/**
 * A pessoa já viu as boas-vindas neste aparelho? (só aparecem uma vez, antes do primeiro login)
 * @returns {boolean}
 * Usado por: App (rota inicial sem login).
 */
export function wasOnboardingSeen() {
  return readPreference(SEEN_KEY, false) === true;
}

/** Boas-vindas: o que é Libras, como a trilha funciona e a câmera. "Pular" e "Começar" levam ao login. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const finish = () => {
    storePreference(SEEN_KEY, true);
    navigate("/entrar", { replace: true });
  };

  return (
    <main className="onboarding">
      <div className="onboarding__top">
        {index > 0 && (
          <button type="button" className="icon-button" onClick={() => setIndex(index - 1)} aria-label="Voltar">
            <Icon name="back" size={28} strokeWidth={2.2} />
          </button>
        )}
        {!isLast && (
          <button type="button" className="onboarding__skip" onClick={finish}>Pular</button>
        )}
      </div>

      <section className="onboarding__slide" aria-live="polite" key={index}>
        <span className="onboarding__art"><LogoHand size={150} /></span>
        <h1 className="onboarding__title">{slide.title}</h1>
        <p className="onboarding__text">{slide.text}</p>
      </section>

      <div className="onboarding__dots" aria-label={`Tela ${index + 1} de ${SLIDES.length}`} role="img">
        {SLIDES.map((item, dot) => (
          <span key={item.title} className={`onboarding__dot${dot === index ? " onboarding__dot--active" : ""}`} />
        ))}
      </div>
      <button type="button" className="button-primary onboarding__next" onClick={isLast ? finish : () => setIndex(index + 1)}>
        {isLast ? "Começar" : "Prosseguir"}
      </button>
    </main>
  );
}
