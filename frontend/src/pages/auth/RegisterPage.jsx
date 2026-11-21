import { useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { AuthBrand, GoogleButton, IconField, PasswordField } from "./AuthForm.jsx";
import { TermsScreen } from "./TermsPage.jsx";
import { isValidEmail, validateNewPassword } from "./validation.js";
import "./auth.css";
import { MESSAGES } from "../../config/messages.js";

/** Mesmas regras do backend, para avisar antes de enviar. */
function validateRegistration({ nickname, email, password, passwordConfirmation, acceptedTerms }) {
  if (!nickname.trim()) return MESSAGES.auth.nameRequired;
  if (!isValidEmail(email)) return MESSAGES.auth.invalidEmail;
  const passwordError = validateNewPassword(password, passwordConfirmation);
  if (passwordError) return passwordError;
  if (!acceptedTerms) return MESSAGES.auth.acceptTerms;
  return "";
}

/** Cadastro (protótipo "Cadastro alta 2"). */
export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ nickname: "", email: "", password: "", passwordConfirmation: "", acceptedTerms: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // O termo abre por cima do formulário (sem trocar de rota), então nada do que foi digitado se perde.
  const [showingTerms, setShowingTerms] = useState(false);

  const updateField = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateRegistration(form);
    setError(validationError);
    if (validationError) return;

    setSubmitting(true);
    try {
      await register({ nickname: form.nickname.trim(), email: form.email.trim(), password: form.password, acceptedTerms: true });
    } catch (registerError) {
      setError(registerError.message);
      setSubmitting(false);
    }
  }

  if (showingTerms) return <TermsScreen onBack={() => setShowingTerms(false)} />;

  return (
    <main className="auth-screen">
      <AuthBrand backTo="/entrar" backLabel="Voltar para o login" />
      <div className="auth-screen__heading">
        <h1 className="auth-screen__title">Criar sua conta</h1>
        <p className="auth-screen__subtitle">Leva menos de um minuto.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <IconField icon="person" label="Nome completo" value={form.nickname} onChange={updateField("nickname")} autoComplete="name" maxLength={60} />
        <IconField icon="mail" label="E-mail" type="email" value={form.email} onChange={updateField("email")} autoComplete="email" />
        <PasswordField label="Senha" value={form.password} onChange={updateField("password")} autoComplete="new-password" />
        <PasswordField label="Confirmar senha" value={form.passwordConfirmation} onChange={updateField("passwordConfirmation")} autoComplete="new-password" />
        <div className="auth-terms">
          <input
            id="accept-terms"
            type="checkbox"
            checked={form.acceptedTerms}
            onChange={(event) => updateField("acceptedTerms")(event.target.checked)}
          />
          <label htmlFor="accept-terms">Li e estou de acordo com o</label>{" "}
          <button type="button" className="auth-link-button" onClick={() => setShowingTerms(true)}>Termo de Uso</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Criando…" : "Criar conta"}
        </button>
      </form>
      <GoogleButton onUnavailable={setError} />
    </main>
  );
}
