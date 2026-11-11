import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useAppConfig } from "../../context/AppConfigContext.jsx";
import { AppIcon } from "../../components/illustrations.jsx";
import { useAppVersion } from "./useAppVersion.js";
import "./update-gate.css";

/**
 * Tela de atualização do APK. Os dados vêm do painel (Configurações → Atualização do app, em /app-config):
 * - versão nova maior que a instalada: mostra a tela, com "Depois" (fecha só até o app ser fechado: toda vez
 *   que o app abrir desatualizado, a tela aparece de novo);
 * - versão instalada menor que a mínima: a tela não fecha até atualizar.
 * "Atualizar agora" abre o link do APK no navegador do celular, que baixa o arquivo; a pessoa instala por cima
 * (os dados da conta ficam no servidor). Só aparece no APK; no navegador não faz nada.
 * Usado por: App.jsx (sobre qualquer tela).
 */
export function UpdateGate() {
  const { text, refreshIfStale } = useAppConfig();
  const installed = useAppVersion();
  // Guardado só na memória: some ao fechar o app, então a tela volta na próxima abertura.
  const [dismissed, setDismissed] = useState(0);

  // O Android mantém o app na memória: voltar a ele (de outro app ou da tela inicial) também conta como abrir.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listener = null;
    let removed = false;
    import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("resume", () => {
        setDismissed(0);
        refreshIfStale(); // confere no painel se saiu versão nova enquanto o app estava parado
      });
      if (removed) handle.remove();
      else listener = handle;
    });
    return () => {
      removed = true;
      listener?.remove();
    };
  }, [refreshIfStale]);

  const latest = Number(text("app.update.latestVersionCode")) || 0;
  const minimum = Number(text("app.update.minVersionCode")) || 0;
  const url = text("app.update.downloadUrl").trim();
  if (!installed || !url) return null;

  const required = minimum > installed.code;
  const available = latest > installed.code;
  if (!required && (!available || dismissed === latest)) return null;

  const versionName = text("app.update.versionName").trim();
  const notes = text("app.update.notes").trim();
  const later = () => setDismissed(latest);
  // Link externo: o Capacitor abre no navegador do celular (o app continua aberto por trás).
  const update = () => window.location.assign(url);

  return (
    <div className="update-gate" role="alertdialog" aria-modal="true" aria-labelledby="update-gate-title" aria-describedby="update-gate-text">
      <div className="update-gate__card">
        <AppIcon size={72} />
        <h2 id="update-gate-title" className="update-gate__title">
          {required ? "Atualize para continuar" : "Nova versão disponível"}
        </h2>
        <p id="update-gate-text" className="update-gate__text">
          {required
            ? "Esta versão do Signa não é mais suportada. Baixe a nova para continuar estudando."
            : `A versão ${versionName || "nova"} do Signa chegou.`}
          {" "}Você tem a {installed.name}.
        </p>
        {notes && (
          <div className="update-gate__notes">
            <strong>Novidades</strong>
            <p>{notes}</p>
          </div>
        )}
        <button type="button" className="button-primary update-gate__button" onClick={update} autoFocus>
          Atualizar agora
        </button>
        {!required && (
          <button type="button" className="update-gate__later" onClick={later}>Depois</button>
        )}
        <p className="update-gate__hint">
          O arquivo é baixado pelo navegador. Abra-o para instalar: se o Android pedir, permita instalar apps desta fonte.
          Seu progresso continua salvo na sua conta.
        </p>
      </div>
    </div>
  );
}
