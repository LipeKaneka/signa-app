import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { GoogleLogo, SignaLudusLogo } from "../../components/illustrations.jsx";

/** Campo com ícone à esquerda (padrão das telas de entrada do protótipo). */
export function IconField({ icon, label, type = "text", value, onChange, autoComplete, children, ...inputProps }) {
  return (
    <label className="field">
      <Icon name={icon} size={20} strokeWidth={1.5} />
      <span className="visually-hidden">{label}</span>
      <input
        type={type}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        {...inputProps}
      />
      {children}
    </label>
  );
}

/**
 * Campo de senha com cadeado. withToggle = olho à direita para mostrar/esconder a senha (login do protótipo).
 */
export function PasswordField({ label, value, onChange, autoComplete, withToggle = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <IconField icon="lock" label={label} type={visible ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} required>
      {withToggle && (
        <button
          type="button"
          className="field__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Esconder a senha" : "Mostrar a senha"}
          aria-pressed={visible}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={20} strokeWidth={1.6} />
        </button>
      )}
    </IconField>
  );
}

/**
 * Topo das telas de entrada: voltar (opcional) e a marca Signa Ludus.
 * @param {{backTo?: string, backLabel?: string}} props
 */
export function AuthBrand({ backTo, backLabel = "Voltar" }) {
  return (
    <>
      {backTo && (
        <Link to={backTo} className="icon-button auth-screen__back" aria-label={backLabel}>
          <Icon name="back" size={28} strokeWidth={2.2} />
        </Link>
      )}
      <div className="auth-screen__logo">
        <SignaLudusLogo height={88} />
      </div>
    </>
  );
}

/**
 * Botão quadrado do Google (protótipo). O login com Google ainda não existe no backend:
 * por enquanto o botão só avisa, sem sair do app.
 */
export function GoogleButton({ onUnavailable }) {
  return (
    <button
      type="button"
      className="auth-google"
      onClick={() => onUnavailable("Entrar com o Google ainda não está disponível. Use e-mail e senha.")}
      aria-label="Entrar com o Google"
    >
      <GoogleLogo size={26} />
    </button>
  );
}
