import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Notice, formatDateTime, useAction, useLoad } from "../components/ui.jsx";

/** Lista de frases ↔ texto do campo: uma frase por linha, "Título | texto". */
const phrasesToText = (phrases) => phrases.map((phrase) => (phrase.text ? `${phrase.title} | ${phrase.text}` : phrase.title)).join("\n");
const textToPhrases = (text) =>
  text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [title, ...rest] = line.split("|");
    return { title: title.trim(), text: rest.join("|").trim() };
  });

/** Valor da configuração como texto do campo. */
const toFieldValue = (setting) => (setting.type === "phrases" ? phrasesToText(setting.value) : String(setting.value));

/** Uma configuração com campo, salvar e voltar ao padrão. */
function SettingRow({ setting, editable, onSaved }) {
  const [value, setValue] = useState(toFieldValue(setting));
  const { run, busy, message } = useAction();
  useEffect(() => setValue(toFieldValue(setting)), [setting]);

  const save = () =>
    run(async () => {
      await api(`/settings/${encodeURIComponent(setting.key)}`, {
        method: "PUT",
        body: { value: setting.type === "integer" ? Number(value) : setting.type === "phrases" ? textToPhrases(value) : value },
      });
      onSaved();
    }, "Salvo.");
  const reset = () =>
    run(async () => {
      await api(`/settings/${encodeURIComponent(setting.key)}`, { method: "DELETE" });
      onSaved();
    }, "Voltou ao padrão.");

  const defaultText = setting.type === "phrases" ? `${setting.default.length} frases` : setting.default === "" ? "(vazio)" : setting.default;
  const hint = setting.type === "phrases"
    ? `Uma frase por linha: "Título | texto". O app sorteia uma a cada resposta. Padrão: ${defaultText}${setting.customized ? ` · alterado em ${formatDateTime(setting.updatedAt)}` : ""}`
    : `Padrão: ${defaultText}${setting.customized ? ` · alterado em ${formatDateTime(setting.updatedAt)}` : ""}`;
  return (
    <div className="setting">
      <Field label={<>{setting.label} {setting.public && <Badge>vai para o app</Badge>}</>} hint={hint}>
        {setting.type === "integer" ? (
          <input type="number" min={setting.min} max={setting.max} value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} />
        ) : setting.type === "phrases" ? (
          <textarea rows={Math.min(14, value.split("\n").length + 1)} value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} />
        ) : setting.type === "text" ? (
          <textarea rows={4} maxLength={setting.maxLength} value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} />
        ) : setting.type === "url" ? (
          <input type="url" placeholder="https://..." maxLength={setting.maxLength} value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <input value={value} maxLength={setting.maxLength} disabled={!editable} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>
      {editable && (
        <div className="setting__actions">
          <button className="button" disabled={busy || value === toFieldValue(setting)} onClick={save}>Salvar</button>
          {setting.customized && <button className="button button--ghost" disabled={busy} onClick={reset}>Padrão</button>}
        </div>
      )}
      <Notice message={message} />
    </div>
  );
}

/** Configurações: regras de pontuação e textos do app (valor ausente = padrão do código). */
export function SettingsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/settings"), []);
  const groups = [
    { title: "Pontuação e regras", prefix: "progress." },
    { title: "Textos do app", prefix: "app.feedback." },
    {
      title: "Atualização do app (APK)",
      prefix: "app.update.",
      intro:
        "Para avisar uma versão nova: coloque o APK num link público (ex.: GitHub Releases ou Google Drive), preencha o link e "
        + "o número da versão nova (versionCode do APK). Quem tiver uma versão menor vê a tela de atualização. Com o número mínimo, "
        + "versões abaixo dele ficam bloqueadas até atualizar.",
    },
  ];
  return (
    <section>
      <h1>Configurações</h1>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data &&
        groups.map((group) => (
          <div className="card" key={group.prefix}>
            <h2>{group.title}</h2>
            {group.intro && <p className="muted">{group.intro}</p>}
            {data.settings.filter((setting) => setting.key.startsWith(group.prefix)).map((setting) => (
              <SettingRow key={setting.key} setting={setting} editable={can("manage")} onSaved={reload} />
            ))}
          </div>
        ))}
    </section>
  );
}
