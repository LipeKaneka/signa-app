import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { AuthBrand, GoogleButton, IconField, PasswordField } from "./AuthForm.jsx";
import "./auth.css";

/** Login (protótipo "login alta 2"): Bem-Vindo, e-mail, senha com olho, esqueci a senha, Google. */
export function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
    } catch (signInError) {
      setError(signInError.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <AuthBrand />
      <div className="auth-screen__heading auth-screen__heading--left">
        <h1 className="auth-screen__title">Bem-Vindo</h1>
        <p className="auth-screen__subtitle">Continue sua trilha de Libras de onde parou.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <IconField icon="mail" label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <div className="auth-form__password">
          <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" withToggle />
          <Link to="/esqueci-senha" state={{ email: email.trim() }} className="auth-form__forgot">Esqueci minha senha</Link>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="auth-form__submit">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </button>
          <p className="auth-screen__switch">
            Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link>
          </p>
        </div>
      </form>

      <GoogleButton onUnavailable={setError} />
    </main>
  );
}
