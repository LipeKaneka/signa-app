import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import * as UserApi from "../../api/api-user.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { AuthBrand, IconField, PasswordField } from "./AuthForm.jsx";
import "./auth.css";

const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Passo 1 (protótipo "login alta 3"): e-mail da conta → código enviado → passo 2.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("E-mail inválido.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await UserApi.requestPasswordReset(cleanEmail);
      navigate("/esqueci-senha/codigo", { state: { email: cleanEmail } });
    } catch (requestError) {
      setError(requestError.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <AuthBrand backTo="/entrar" backLabel="Voltar para o login" />
      <div className="auth-screen__heading auth-screen__heading--left">
        <h1 className="auth-screen__title">Esqueceu a senha?</h1>
        <p className="auth-screen__subtitle">Calma que temos as manhas</p>
      </div>
      <form className="auth-form auth-form--recovery" onSubmit={handleSubmit} noValidate>
        <div>
          <IconField icon="mail" label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" required />
          <p className="auth-form__hint">Insira o email utilizado na conta da qual você esqueceu a senha.</p>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Enviando…" : "Recuperar Senha"}
        </button>
      </form>
    </main>
  );
}

/**
 * Seis caixas de um dígito (protótipo "login alta 4"): digitar avança, apagar volta, colar preenche tudo.
 */
function CodeBoxes({ digits, onChange }) {
  const inputs = useRef([]);

  function setDigit(index, value) {
    const onlyDigits = value.replace(/\D/g, "");
    if (onlyDigits.length > 1) {
      const pasted = onlyDigits.slice(0, CODE_LENGTH).split("");
      onChange(Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? ""));
      inputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    onChange(digits.map((digit, i) => (i === index ? onlyDigits : digit)));
    if (onlyDigits && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
  }

  return (
    <div className="code-boxes" role="group" aria-label="Código de 6 dígitos">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => (inputs.current[index] = element)}
          className="code-boxes__digit"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={CODE_LENGTH}
          value={digit}
          onChange={(event) => setDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          aria-label={`Dígito ${index + 1}`}
          autoFocus={index === 0}
        />
      ))}
    </div>
  );
}

/**
 * Passo 2 (protótipo "login alta 4"): código de 6 dígitos → passo 3. Dá para reenviar o código.
 */
export function ResetCodePage() {
  const navigate = useNavigate();
  const email = useLocation().state?.email;
  const [digits, setDigits] = useState(() => Array(CODE_LENGTH).fill(""));
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!email) return <Navigate to="/esqueci-senha" replace />;
  const code = digits.join("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setMessage({ error: true, text: "Digite os 6 números do código." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await UserApi.verifyPasswordReset(email, code);
      navigate("/esqueci-senha/nova-senha", { state: { email, code } });
    } catch (verifyError) {
      setMessage({ error: true, text: verifyError.message });
      setSubmitting(false);
    }
  }

  async function resendCode() {
    setMessage(null);
    try {
      await UserApi.requestPasswordReset(email);
      setDigits(Array(CODE_LENGTH).fill(""));
      setMessage({ error: false, text: "Enviamos um novo código." });
    } catch (resendError) {
      setMessage({ error: true, text: resendError.message });
    }
  }

  return (
    <main className="auth-screen">
      <AuthBrand backTo="/esqueci-senha" />
      <div className="auth-screen__heading auth-screen__heading--left">
        <h1 className="auth-screen__title">Insira o Codigo</h1>
        <p className="auth-screen__subtitle">Achou que era facil?</p>
      </div>
      <form className="auth-form auth-form--recovery" onSubmit={handleSubmit} noValidate>
        <div>
          <CodeBoxes digits={digits} onChange={setDigits} />
          <p className="auth-form__hint">Um codigo foi enviado para seu email, insira o codigo para redefinir a senha.</p>
        </div>
        {message && <p className={message.error ? "form-error" : "form-success"} role={message.error ? "alert" : "status"}>{message.text}</p>}
        <div className="auth-form__submit">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? "Verificando…" : "Verificar"}
          </button>
          <p className="auth-screen__switch auth-screen__switch--light">
            Clique aqui para <button type="button" className="auth-link-button" onClick={resendCode}>Reenviar o codigo</button>
          </p>
        </div>
      </form>
    </main>
  );
}

/**
 * Passo 3 (não existe no protótipo; segue o mesmo desenho): senha nova → troca e já entra na conta.
 */
export function NewPasswordPage() {
  const { resetPassword } = useAuth();
  const { email, code } = useLocation().state ?? {};
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!email || !code) return <Navigate to="/esqueci-senha" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return setError("A senha precisa ter letras e números.");
    if (password !== confirmation) return setError("As senhas não são iguais.");
    setError("");
    setSubmitting(true);
    try {
      await resetPassword(email, code, password);
    } catch (resetError) {
      setError(resetError.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <AuthBrand backTo="/entrar" backLabel="Voltar para o login" />
      <div className="auth-screen__heading auth-screen__heading--left">
        <h1 className="auth-screen__title">Nova senha</h1>
        <p className="auth-screen__subtitle">Agora escolha uma senha que você vai lembrar</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <PasswordField label="Nova senha" value={password} onChange={setPassword} autoComplete="new-password" withToggle />
        <PasswordField label="Confirmar senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
      <p className="auth-screen__switch">
        Lembrou a senha? <Link to="/entrar">Entrar</Link>
      </p>
    </main>
  );
}
