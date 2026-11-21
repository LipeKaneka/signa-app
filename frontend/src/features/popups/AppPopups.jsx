import { useEffect, useState } from "react";
import { onMaintenance } from "../../api/http-client.js";
import { AppPopup } from "../../components/AppPopup.jsx";
import { MESSAGES } from "../../config/messages.js";
import { useAppConfig } from "../../context/AppConfigContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { exitApp } from "../../utils/native-app.js";
import { readPreference, storePreference } from "../../utils/session-storage.js";
import { useUpdatePopup } from "../app-update/UpdateGate.jsx";

const SEEN_ANNOUNCEMENTS_KEY = "seen-announcements";
/** Com o pop-up de manutenção na tela, confere a cada 15 s se ela terminou (normalmente é a cada 1 min). */
const MAINTENANCE_CHECK_MS = 15 * 1000;

/**
 * Pop-up de manutenção (categoria "Manutenção" do painel). Aparece:
 * - sem login, enquanto a manutenção vale (com "Sou da equipe: entrar" para quem está liberado poder entrar);
 * - com login, quando o servidor recusa a conta por não estar liberada (503 "maintenance" em qualquer pedido).
 * O botão fecha o app (no navegador, só avisa que pode fechar a aba). Some sozinho quando a manutenção termina.
 * @returns {object|null} props do AppPopup.
 */
function useMaintenancePopup() {
  const { popups, refresh } = useAppConfig();
  const { status } = useAuth();
  const [blocked, setBlocked] = useState(null);
  const [staffBypass, setStaffBypass] = useState(false);
  const [webClosed, setWebClosed] = useState(false);
  const maintenance = popups.maintenance;

  useEffect(() => onMaintenance((popup) => setBlocked(popup ?? {})), []);
  // Terminou a manutenção (o /app-config já diz que não vale): libera tudo de novo.
  useEffect(() => {
    if (!maintenance.active) {
      setBlocked(null);
      setStaffBypass(false);
    }
  }, [maintenance.active]);

  const showForGuest = maintenance.active && status !== "signedIn" && !staffBypass;
  const visible = Boolean(blocked) || showForGuest;
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setInterval(() => refresh(true), MAINTENANCE_CHECK_MS);
    return () => clearInterval(timer);
  }, [visible, refresh]);
  if (!visible) return null;
  const popup = { ...maintenance, ...blocked };
  return {
    key: "maintenance",
    title: popup.title,
    message: webClosed ? MESSAGES.popups.maintenanceWebClosed : popup.message,
    notesTitle: popup.notesTitle,
    notes: popup.notes,
    primaryLabel: popup.buttonText,
    onPrimary: async () => {
      if (!(await exitApp())) setWebClosed(true);
    },
    // Quem está na lista de liberados entra normalmente; se não estiver, o login cai neste pop-up de novo.
    secondaryLabel: blocked ? undefined : MESSAGES.popups.maintenanceStaff,
    onSecondary: () => setStaffBypass(true),
  };
}

/**
 * Avisos do painel (categoria "Avisos"): um de cada vez, cada um uma vez por aparelho (editar o aviso no painel
 * muda a versão e ele aparece de novo). Com link, o botão abre a página.
 * @returns {object|null} props do AppPopup.
 */
function useAnnouncementPopup() {
  const { popups } = useAppConfig();
  const [seen, setSeen] = useState(() => readPreference(SEEN_ANNOUNCEMENTS_KEY, {}));
  const next = popups.announcements.find((announcement) => seen[announcement.id] !== announcement.version);
  if (!next) return null;

  const dismiss = () => {
    // Guarda só os avisos que ainda existem (a lista não cresce para sempre).
    const live = new Set(popups.announcements.map((announcement) => announcement.id));
    const updated = Object.fromEntries(Object.entries({ ...seen, [next.id]: next.version }).filter(([id]) => live.has(id)));
    storePreference(SEEN_ANNOUNCEMENTS_KEY, updated);
    setSeen(updated);
  };
  return {
    key: `announcement-${next.id}-${next.version}`,
    title: next.title,
    message: next.message,
    notesTitle: next.notesTitle,
    notes: next.notes,
    primaryLabel: next.buttonText || MESSAGES.popups.announcementButton,
    onPrimary: () => {
      dismiss();
      if (next.link) window.open(next.link, "_blank", "noopener");
    },
  };
}

/**
 * Mostra no máximo um pop-up por vez, por prioridade: manutenção > atualização > avisos.
 * Fica por cima de qualquer tela, inclusive do login.
 * Usado por: App.jsx.
 */
export function AppPopups() {
  const maintenance = useMaintenancePopup();
  const update = useUpdatePopup();
  const announcement = useAnnouncementPopup();
  const popup = maintenance ?? update ?? announcement;
  if (!popup) return null;
  const { key, ...props } = popup;
  return <AppPopup key={key} {...props} />;
}
