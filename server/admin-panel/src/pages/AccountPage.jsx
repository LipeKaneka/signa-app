import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ROLE_LABELS } from "../components/Layout.jsx";
import { Field, Notice, useAction } from "../components/ui.jsx";

/** Minha conta: dados e troca de senha (as outras sessões são encerradas). */
export function AccountPage() {
  const { admin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const { run, busy, message } = useAction();

  const submit = async (event) => {
    event.preventDefault();
    const ok = await run(async () => {
      if (newPassword !== repeat) throw new Error("As senhas novas não conferem.");
      await api("/auth/password", { method: "POST", body: { currentPassword, newPassword } });
    }, "Senha trocada. As outras sessões foram encerradas.");
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setRepeat("");
    }
  };

  return (
    <section>
      <h1>Minha conta</h1>
      <div className="card">
        <p><strong>{admin.name}</strong> — {admin.email}</p>
        <p className="muted">Papel: {ROLE_LABELS[admin.role]}</p>
      </div>
      <form className="card form" onSubmit={submit}>
        <h2>Trocar senha</h2>
        <Field label="Senha atual">
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <Field label="Nova senha" hint="12 ou mais caracteres, com letras e números.">
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </Field>
        <Field label="Repita a nova senha">
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </Field>
        <Notice message={message} />
        <button className="button" disabled={busy}>Salvar senha</button>
      </form>
    </section>
  );
}
