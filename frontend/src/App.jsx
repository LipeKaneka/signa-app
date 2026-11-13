import { lazy, Suspense, useEffect, useRef } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "./context/AuthContext.jsx";
import { useAppConfig } from "./context/AppConfigContext.jsx";
import { SplashScreen } from "./components/SplashScreen.jsx";
import { UpdateGate } from "./features/app-update/UpdateGate.jsx";
import { AppEventsProvider } from "./features/achievements/AppEventsContext.jsx";
import { NotificationsProvider } from "./features/notifications/NotificationsContext.jsx";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { OnboardingPage, wasOnboardingSeen } from "./pages/auth/OnboardingPage.jsx";
import { TrailPage } from "./pages/trail/TrailPage.jsx";
import { ModulePage } from "./pages/trail/ModulePage.jsx";
import { ActivityPage } from "./pages/activity/ActivityPage.jsx";

/** Carrega uma tela só quando ela é aberta (o app abre mais leve; trilha, módulo e atividade já vêm prontos). */
const lazyPage = (load, name) => lazy(() => load().then((module) => ({ default: module[name] })));
const RegisterPage = lazyPage(() => import("./pages/auth/RegisterPage.jsx"), "RegisterPage");
const TermsPage = lazyPage(() => import("./pages/auth/TermsPage.jsx"), "TermsPage");
const ForgotPasswordPage = lazyPage(() => import("./pages/auth/PasswordRecoveryPages.jsx"), "ForgotPasswordPage");
const ResetCodePage = lazyPage(() => import("./pages/auth/PasswordRecoveryPages.jsx"), "ResetCodePage");
const NewPasswordPage = lazyPage(() => import("./pages/auth/PasswordRecoveryPages.jsx"), "NewPasswordPage");
const RankingPage = lazyPage(() => import("./pages/ranking/RankingPage.jsx"), "RankingPage");
const AssistantPage = lazyPage(() => import("./pages/assistant/AssistantPage.jsx"), "AssistantPage");
const ProfilePage = lazyPage(() => import("./pages/profile/ProfilePage.jsx"), "ProfilePage");
const AchievementsPage = lazyPage(() => import("./pages/achievements/AchievementsPage.jsx"), "AchievementsPage");
const NotificationsPage = lazyPage(() => import("./pages/notifications/NotificationsPage.jsx"), "NotificationsPage");
const DictionaryPage = lazyPage(() => import("./pages/dictionary/DictionaryPage.jsx"), "DictionaryPage");
const SettingsPage = lazyPage(() => import("./pages/settings/SettingsPage.jsx"), "SettingsPage");

// A câmera carrega o MediaPipe (pesado): só baixa quando a pessoa abre o tradutor.
const CameraPage = lazy(() => import("./pages/camera/CameraPage.jsx"));
const TeachSignPage = lazy(() => import("./pages/camera/TeachSignPage.jsx"));
const HandAnalysisPage = lazy(() => import("./pages/camera/HandAnalysisPage.jsx"));
// Experimento VLibras × câmera: só existe em desenvolvimento (npm run dev).
const LabPage = import.meta.env.DEV ? lazy(() => import("./pages/lab/LabPage.jsx").then((m) => ({ default: m.LabPage }))) : null;

/** Cada tela nova começa do topo (o HashRouter mantém a rolagem da anterior). */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Ao trocar de tela, confere eventos e textos do painel (a faixa de evento muda sem reabrir o app). */
function RefreshConfigOnNavigate() {
  const { pathname } = useLocation();
  const { refreshIfStale } = useAppConfig();
  useEffect(() => {
    refreshIfStale();
  }, [pathname, refreshIfStale]);
  return null;
}

/** Telas "de saída": nelas o botão voltar do celular manda o app para segundo plano (sem fechar). */
const ROOT_PATHS = ["/trilha", "/entrar", "/boas-vindas"];
const ACTIVITY_EXIT_QUESTION = "Sair da atividade? O progresso desta tentativa será perdido.";

/**
 * Botão "voltar" do Android: fecha a janela aberta (sinal, aviso), volta para a tela anterior e, na atividade,
 * pergunta antes de sair. Nas telas iniciais, o app vai para segundo plano em vez de fechar.
 * No navegador não faz nada (o voltar do navegador já usa o histórico).
 */
function HardwareBackButton({ signedIn }) {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useRef(location);
  current.current = location;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listener = null;
    let removed = false;
    import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("backButton", () => {
        const { pathname, key } = current.current;
        // Janela aberta (sinal, conta banida...): fecha como o Esc.
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          return;
        }
        if (ROOT_PATHS.includes(pathname)) {
          App.minimizeApp();
          return;
        }
        // Na atividade em andamento pergunta antes; na tela de resultado (mesmo endereço) só volta.
        const answering = pathname.startsWith("/atividade/") && !document.querySelector(".activity-result");
        if (answering && !window.confirm(ACTIVITY_EXIT_QUESTION)) return;
        // Sem tela anterior (app aberto direto nesta tela): vai para a tela inicial.
        if (key === "default") navigate(signedIn ? "/trilha" : "/entrar", { replace: true });
        else navigate(-1);
      });
      if (removed) handle.remove();
      else listener = handle;
    });
    return () => {
      removed = true;
      listener?.remove();
    };
  }, [navigate, signedIn]);
  return null;
}

/** Na primeira vez no aparelho, as boas-vindas vêm antes do login (conferido a cada visita, não só ao montar as rotas). */
function LoginOrOnboarding() {
  return wasOnboardingSeen() ? <LoginPage /> : <Navigate to="/boas-vindas" replace />;
}

function PublicRoutes() {
  return (
    <Suspense fallback={<SplashScreen message="Carregando…" />}>
    <Routes>
      <Route path="/boas-vindas" element={<OnboardingPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/entrar" element={<LoginOrOnboarding />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/esqueci-senha/codigo" element={<ResetCodePage />} />
      <Route path="/esqueci-senha/nova-senha" element={<NewPasswordPage />} />
      <Route path="*" element={<Navigate to="/entrar" replace />} />
    </Routes>
    </Suspense>
  );
}

function PrivateRoutes() {
  return (
    <Suspense fallback={<SplashScreen message="Carregando…" />}>
      <Routes>
        <Route path="/trilha" element={<TrailPage />} />
        <Route path="/trilha/modulo/:moduleId" element={<ModulePage />} />
        <Route path="/atividade/:activityId" element={<ActivityPage />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/assistente" element={<AssistantPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/conquistas" element={<AchievementsPage />} />
        <Route path="/notificacoes" element={<NotificationsPage />} />
        <Route path="/dicionario" element={<DictionaryPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="/termos" element={<TermsPage />} />
        <Route path="/camera" element={<CameraPage />} />
        <Route path="/camera/ensinar" element={<TeachSignPage />} />
        <Route path="/camera/analise" element={<HandAnalysisPage />} />
        {LabPage && <Route path="/laboratorio" element={<LabPage />} />}
        <Route path="*" element={<Navigate to="/trilha" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <>
      <AppScreens />
      {/* Aviso de APK novo (configurado no painel), por cima de qualquer tela, inclusive do login. */}
      <UpdateGate />
    </>
  );
}

function AppScreens() {
  const { status, retryConnection } = useAuth();
  if (status === "loading") return <SplashScreen slowHint="Conectando ao servidor… na primeira vez do dia isso pode levar até 1 minuto." />;
  if (status === "offline") {
    return <SplashScreen message="Sem conexão com o servidor agora. Confira a internet e tente de novo." onRetry={retryConnection} />;
  }

  return (
    <HashRouter>
      <ScrollToTopOnNavigate />
      <HardwareBackButton signedIn={status === "signedIn"} />
      <RefreshConfigOnNavigate />
      {status === "signedIn" ? (
        <AppEventsProvider>
          <NotificationsProvider>
            <PrivateRoutes />
          </NotificationsProvider>
        </AppEventsProvider>
      ) : <PublicRoutes />}
    </HashRouter>
  );
}
