import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import * as UserApi from "../../api/api-user.js";
import { ScreenWithNav, Toggle } from "../../components/layout.jsx";
import { Icon } from "../../components/Icon.jsx";
import { AppIcon } from "../../components/illustrations.jsx";
import "./settings.css";
import { useAppVersion } from "../../features/app-update/useAppVersion.js";
import { useAppEvents } from "../../features/achievements/AppEventsContext.jsx";

/** Linhas na ordem do protótipo. type: toggle | theme | fontSize. */
const SETTING_ROWS = [
  { type: "toggle", key: "notifications", label: "Notificações" },
  { type: "theme", key: "theme", label: "Tema de tela" },
  { type: "toggle", key: "tipsDuringLessons", label: "Dicas durante lições" },
  { type: "fontSize", key: "fontScale", label: "Mudar tamanho da fonte" },
  { type: "toggle", key: "highContrast", label: "Contraste alto na fonte" },
  { type: "toggle", key: "soundsAndVibration", label: "Efeitos sonoros e vibrações" },
];

function ThemeSwitch({ theme, onChange }) {
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Tema de tela">
      {["light", "dark"].map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          aria-label={option === "light" ? "Tema claro" : "Tema escuro"}
          className="theme-switch__option"
          onClick={() => onChange(option)}
        >
          <Icon name={option === "light" ? "sun" : "moon"} size={22} filled />
        </button>
      ))}
    </div>
  );
}

function FontSizeSlider({ value, onChange }) {
  return (
    <label className="font-slider">
      <span aria-hidden="true" className="font-slider__small">A</span>
      <span className="visually-hidden">Tamanho da fonte</span>
      <input type="range" min="0.9" max="1.3" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span aria-hidden="true" className="font-slider__large">A</span>
    </label>
  );
}

function SettingControl({ row, value, onChange }) {
  if (row.type === "theme") return <ThemeSwitch theme={value} onChange={onChange} />;
  if (row.type === "fontSize") return <FontSizeSlider value={value} onChange={onChange} />;
  return <Toggle checked={value} onChange={onChange} label={row.label} />;
}

function DeleteAccountForm({ onCancel }) {
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await UserApi.deleteAccount(password);
      signOut();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  return (
    <form className="danger-form" onSubmit={handleSubmit}>
      <p>Isso apaga sua conta e todo o progresso. Não dá para desfazer.</p>
      <label className="field">
        <Icon name="lock" size={18} />
        <span className="visually-hidden">Senha atual</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha atual" autoComplete="current-password" required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="danger-form__actions">
        <button type="button" className="button-link" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary danger-form__confirm">Excluir conta</button>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const { settings, updateSetting } = useSettings();
  const { track } = useAppEvents();
  const version = useAppVersion();
  const { signOut } = useAuth();
  const [showHelp, setShowHelp] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <ScreenWithNav title="Configurações" backTo={-1} contentClassName="settings-content">
      <div className="settings-icon"><AppIcon size={100} /></div>
      {version && <p className="settings-version">Versão {version.name} ({version.code})</p>}

      <ul className="settings-list">
        {SETTING_ROWS.map((row) => (
          <li key={row.key} className="settings-row">
            {row.label}
            <SettingControl
              row={row}
              value={settings[row.key]}
              onChange={(value) => {
                if (row.key === "theme" && value !== settings.theme) track("theme_change");
                updateSetting(row.key, value);
              }}
            />
          </li>
        ))}
        <li>
          <button type="button" className="settings-row settings-row--button" onClick={() => setShowHelp((value) => !value)} aria-expanded={showHelp}>
            Ajuda e feedback
            <Icon name="chevronRight" size={16} />
          </button>
          {showHelp && (
            <p className="settings-help">
              O avatar dos exercícios é do VLibras (governo federal, LGPL-3.0). O nome do sinal é enviado aos servidores
              do VLibras para o avatar funcionar. Dúvidas e sugestões: fale com a equipe do Signa Ludus.{" "}
              <Link to="/termos">Ler o Termo de Uso</Link>.
            </p>
          )}
        </li>
        <li>
          <button type="button" className="settings-row settings-row--button" onClick={signOut}>
            Sair da conta
            <Icon name="logout" size={16} />
          </button>
        </li>
        <li>
          {confirmingDelete ? (
            <DeleteAccountForm onCancel={() => setConfirmingDelete(false)} />
          ) : (
            <button type="button" className="settings-row settings-row--button settings-row--danger" onClick={() => setConfirmingDelete(true)}>
              Excluir conta
              <Icon name="chevronRight" size={16} />
            </button>
          )}
        </li>
      </ul>
    </ScreenWithNav>
  );
}
