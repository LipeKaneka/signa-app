import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { GoogleLogo, SignaLudusLogo } from "../../components/illustrations.jsx";
import { BanDialog } from "../../components/BanDialog.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useAppConfig } from "../../context/AppConfigContext.jsx";
import { ACCOUNT_BANNED, ApiError } from "../../api/http-client.js";

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
 * "Web client ID" do Google Cloud. Vem do servidor (GOOGLE_CLIENT_IDS no Render, via /app-config); o
 * VITE_GOOGLE_WEB_CLIENT_ID do build, se existir, tem prioridade. Vazio = o botão só avisa.
 */
const BUILD_GOOGLE_WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? "").trim();

let googleReady = null;
let googleReadyFor = "";

/** Carrega o plugin do Google só quando o botão é tocado (e de novo se o ID mudar). */
function loadGoogleSignIn(webClientId) {
  if (googleReadyFor !== webClientId) googleReady = null;
  googleReadyFor = webClientId;
  googleReady ??= import("@capgo/capacitor-social-login")
    .then(async ({ SocialLogin }) => {
      await SocialLogin.initialize({ google: { webClientId, mode: "online" } });
      return SocialLogin;
    })
    .catch((error) => {
      googleReady = null;
      throw error;
    });
  return googleReady;
}

/** A pessoa fechou a janela do Google sem escolher conta: não é erro para mostrar. */
function wasCancelled(error) {
  return /cancel/i.test(String(error?.message ?? error?.code ?? ""));
}

/**
 * Botão quadrado do Google (protótipo): abre a escolha de conta do Google no aparelho, manda o ID token ao
 * backend e entra (conta nova é criada; conta com o mesmo e-mail ganha o Google ligado). Conta banida mostra o aviso.
 * @param {{onUnavailable: (message: string) => void}} props - onUnavailable mostra uma mensagem de erro na tela.
 * Usado por: LoginPage e RegisterPage.
 */
export function GoogleButton({ onUnavailable }) {
  const { signInWithGoogle } = useAuth();
  const { text } = useAppConfig();
  const [busy, setBusy] = useState(false);
  const [ban, setBan] = useState(null);
  const webClientId = BUILD_GOOGLE_WEB_CLIENT_ID || text("auth.googleWebClientId").trim();

  async function handleClick() {
    if (!webClientId) {
      onUnavailable("Entrar com o Google ainda não está disponível. Use e-mail e senha.");
      return;
    }
    setBusy(true);
    onUnavailable("");
    try {
      const SocialLogin = await loadGoogleSignIn(webClientId);
      const response = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"] } });
      const idToken = response?.result?.idToken;
      if (!idToken) throw new Error("Sem token do Google.");
      await signInWithGoogle(idToken);
    } catch (error) {
      if (error?.code === ACCOUNT_BANNED) setBan(error.ban);
      else if (!wasCancelled(error)) {
        onUnavailable(error instanceof ApiError ? error.message : "Não foi possível entrar com o Google. Tente de novo.");
      }
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="auth-google"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        aria-label={busy ? "Entrando com o Google…" : "Entrar com o Google"}
      >
        <GoogleLogo size={26} />
      </button>
      {webClientId && (
        <p className="auth-google__terms">
          Ao entrar com o Google, você aceita o <Link to="/termos">Termo de Uso</Link>.
        </p>
      )}
      {ban && <BanDialog ban={ban} onClose={() => setBan(null)} />}
    </>
  );
}
