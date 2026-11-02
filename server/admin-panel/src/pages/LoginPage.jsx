import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { Field, Notice, useAction } from "../components/ui.jsx";
import logoColorida from "../assets/brand/logo-colorida.svg";
import tipografiaColorida from "../assets/brand/tipografia-colorida.svg";

/** Tela de entrada do painel (contas de administrador, separadas das contas do app). */
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { run, busy, message } = useAction();

  const submit = (event) => {
    event.preventDefault();
    run(() => login(email.trim(), password));
  };

  return (
    <div className="login">
      <form className="card login__card" onSubmit={submit}>
        <h1 className="login__brand">
          <img src={logoColorida} alt="" className="login__hand" />
          <img src={tipografiaColorida} alt="Signa Ludus" className="login__name" />
        </h1>
        <p className="muted">Painel de administração</p>
        <Field label="E-mail">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Notice message={message} />
        <button className="button" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <p className="field__hint">Sem conta? Peça a um owner do painel. O primeiro owner é criado no servidor com
          <code> npm run admin:create-owner</code>.</p>
      </form>
    </div>
  );
}
