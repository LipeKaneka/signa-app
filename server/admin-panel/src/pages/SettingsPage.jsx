import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

/** Campos de "Atualização do app" que a busca no GitHub preenche (chave da configuração → campo da resposta). */
const GITHUB_FIELDS = [
  ["app.update.versionName", "versionName", "Nome da versão"],
  ["app.update.latestVersionCode", "latestVersionCode", "Número (versionCode)"],
  ["app.update.downloadUrl", "downloadUrl", "Link do APK"],
  ["app.update.notes", "notes", "Novidades"],
];

/**
 * "Buscar no GitHub": lê a release mais recente do repositório (app.update.githubRepo) e mostra os dados que vão
 * para a tela de atualização do app; "Aplicar" salva os campos encontrados (os vazios ficam como estão).
 */
function GithubReleaseImporter({ onApplied }) {
  const [release, setRelease] = useState(null);
  const search = useAction();
  const apply = useAction();

  const fetchRelease = () =>
    search.run(async () => {
      setRelease(null);
      setRelease(await api("/app-update/github"));
    });

  const found = release ? GITHUB_FIELDS.filter(([, field]) => release.fields[field] !== null && release.fields[field] !== "") : [];
  const applyRelease = () =>
    apply.run(async () => {
      for (const [key, field] of found) {
        await api(`/settings/${encodeURIComponent(key)}`, { method: "PUT", body: { value: release.fields[field] } });
      }
      onApplied();
    }, "Dados da release aplicados: quem tiver uma versão menor já vê a tela de atualização.");

  return (
    <div className="github-import">
      <div className="setting__actions">
        <button className="button" disabled={search.busy} onClick={fetchRelease}>
          {search.busy ? "Buscando…" : "Buscar no GitHub"}
        </button>
      </div>
      <Notice message={search.message} />
      {release && (
        <div className="github-import__result">
          <p>
            <strong>{release.name}</strong> ({release.tag}) · {formatDateTime(release.publishedAt)} ·{" "}
            <a href={release.htmlUrl} target="_blank" rel="noreferrer">abrir no GitHub</a>
          </p>
          <dl>
            {GITHUB_FIELDS.map(([key, field, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd style={{ whiteSpace: "pre-line" }}>{release.fields[field] === null || release.fields[field] === "" ? "—" : String(release.fields[field])}</dd>
              </div>
            ))}
          </dl>
          {release.warnings.map((warning) => <Notice key={warning} message={{ type: "error", text: warning }} />)}
          <div className="setting__actions">
            <button className="button" disabled={apply.busy || found.length === 0} onClick={applyRelease}>Aplicar estes dados</button>
            <button className="button button--ghost" disabled={apply.busy} onClick={() => setRelease(null)}>Cancelar</button>
          </div>
          <Notice message={apply.message} />
        </div>
      )}
    </div>
  );
}

/** Temas das configurações, cada um numa aba (a aba fica no endereço: #/configuracoes?aba=atualizacao). */
const SETTING_TABS = [
  { id: "pontuacao", title: "Pontuação e regras", prefix: "progress." },
  { id: "textos", title: "Textos do app", prefix: "app.feedback." },
  {
    id: "atualizacao",
    title: "Atualização do app",
    prefix: "app.update.",
    intro:
      "Para avisar uma versão nova: publique uma release no GitHub (tag v1.4.0, com o APK anexado e \"versionCode: N\" na "
      + "descrição) e use \"Buscar no GitHub\", ou preencha à mão o link público do APK e o número da versão nova. Quem tiver "
      + "uma versão menor vê a tela de atualização. Com o número mínimo, versões abaixo dele ficam bloqueadas até atualizar.",
    importer: true,
  },
];

/** Configurações em abas por tema: pontuação e regras, textos do app e atualização do app (valor ausente = padrão do código). */
export function SettingsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/settings"), []);
  const [params, setParams] = useSearchParams();
  const tab = SETTING_TABS.find((item) => item.id === params.get("aba")) ?? SETTING_TABS[0];
  return (
    <section>
      <h1>Configurações</h1>
      <div className="section-tabs section-tabs--page" role="tablist" aria-label="Temas das configurações">
        {SETTING_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item === tab}
            className={`section-tabs__tab${item === tab ? " section-tabs__tab--active" : ""}`}
            onClick={() => setParams(item === SETTING_TABS[0] ? {} : { aba: item.id }, { replace: true })}
          >
            {item.title}
          </button>
        ))}
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <div className="card" role="tabpanel" aria-label={tab.title}>
          {tab.intro && <p className="muted">{tab.intro}</p>}
          {tab.importer && can("manage") && <GithubReleaseImporter onApplied={reload} />}
          {data.settings.filter((setting) => setting.key.startsWith(tab.prefix)).map((setting) => (
            <SettingRow key={setting.key} setting={setting} editable={can("manage")} onSaved={reload} />
          ))}
        </div>
      )}
    </section>
  );
}
