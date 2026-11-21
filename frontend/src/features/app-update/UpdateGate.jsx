import { useEffect, useState } from "react";
import { listenToApp } from "../../utils/native-app.js";
import { useAppConfig } from "../../context/AppConfigContext.jsx";
import { useAppVersion } from "./useAppVersion.js";
import { MESSAGES } from "../../config/messages.js";

/**
 * Link do Google Drive "de compartilhar" (abre uma página de visualização) → link que baixa o arquivo direto.
 * Outros links passam sem mudança.
 */
export function directDownloadUrl(url) {
  const driveFile = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/.exec(url);
  return driveFile ? `https://drive.google.com/uc?export=download&id=${driveFile[1]}` : url;
}

/**
 * Pop-up de atualização do APK (categoria "Atualizações" do painel: Pop-ups → Atualizações, em /app-config):
 * - versão nova maior que a instalada: mostra, com "Depois" (fecha só até o app ser fechado: toda vez que o app
 *   abrir desatualizado, aparece de novo);
 * - versão instalada menor que a mínima: não fecha até atualizar.
 * O botão abre o link do APK no navegador do celular, que baixa o arquivo; a pessoa instala por cima (os dados da
 * conta ficam no servidor). Só no APK; no navegador não aparece.
 * @returns {object|null} props do AppPopup, ou null quando não há o que mostrar.
 * Usado por: AppPopups.
 */
export function useUpdatePopup() {
  const { text, refreshIfStale } = useAppConfig();
  const installed = useAppVersion();
  // Guardado só na memória: some ao fechar o app, então o pop-up volta na próxima abertura.
  const [dismissed, setDismissed] = useState(0);

  // O Android mantém o app na memória: voltar a ele (de outro app ou da tela inicial) também conta como abrir.
  useEffect(
    () =>
      listenToApp("resume", () => {
        setDismissed(0);
        refreshIfStale(); // confere no painel se saiu versão nova enquanto o app estava parado
      }),
    [refreshIfStale],
  );

  const latest = Number(text("app.update.latestVersionCode")) || 0;
  const minimum = Number(text("app.update.minVersionCode")) || 0;
  const url = text("app.update.downloadUrl").trim();
  if (!installed || !url) return null;

  const required = minimum > installed.code;
  const available = latest > installed.code;
  if (!required && (!available || dismissed === latest)) return null;

  const versionName = text("app.update.versionName").trim() || "nova";
  const message = required
    ? text("app.update.requiredMessage") || MESSAGES.app.unsupportedVersion
    : (text("app.update.message") || MESSAGES.popups.updateMessage).replaceAll("{versao}", versionName).replaceAll("{atual}", installed.name);
  return {
    key: `update-${latest}-${minimum}`,
    title: text("app.update.title") || MESSAGES.popups.updateTitle,
    message,
    notesTitle: text("app.update.notesTitle") || MESSAGES.popups.updateNotesTitle,
    notes: text("app.update.notes").trim(),
    primaryLabel: text("app.update.buttonText") || MESSAGES.popups.updateButton,
    // Link externo: o Capacitor abre no navegador do celular (o app continua aberto por trás).
    onPrimary: () => window.location.assign(directDownloadUrl(url)),
    secondaryLabel: required ? undefined : text("app.update.laterText") || MESSAGES.popups.updateLater,
    onSecondary: () => setDismissed(latest),
    footnote: MESSAGES.popups.updateHint,
  };
}
