import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { SplashScreen } from "./components/SplashScreen.jsx";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { RegisterPage } from "./pages/auth/RegisterPage.jsx";
import { OnboardingPage, wasOnboardingSeen } from "./pages/auth/OnboardingPage.jsx";
import { TermsPage } from "./pages/auth/TermsPage.jsx";
import { ForgotPasswordPage, NewPasswordPage, ResetCodePage } from "./pages/auth/PasswordRecoveryPages.jsx";
import { TrailPage } from "./pages/trail/TrailPage.jsx";
import { ModulePage } from "./pages/trail/ModulePage.jsx";
import { ActivityPage } from "./pages/activity/ActivityPage.jsx";
import { RankingPage } from "./pages/ranking/RankingPage.jsx";
import { AssistantPage } from "./pages/assistant/AssistantPage.jsx";
import { ProfilePage } from "./pages/profile/ProfilePage.jsx";
import { AchievementsPage } from "./pages/achievements/AchievementsPage.jsx";
import { DictionaryPage } from "./pages/dictionary/DictionaryPage.jsx";
import { SettingsPage } from "./pages/settings/SettingsPage.jsx";

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

/** Na primeira vez no aparelho, as boas-vindas vêm antes do login (conferido a cada visita, não só ao montar as rotas). */
function LoginOrOnboarding() {
  return wasOnboardingSeen() ? <LoginPage /> : <Navigate to="/boas-vindas" replace />;
}

function PublicRoutes() {
  return (
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
  const { status, retryConnection } = useAuth();
  if (status === "loading") return <SplashScreen />;
  if (status === "offline") {
    return <SplashScreen message="Sem conexão com o servidor agora." onRetry={retryConnection} />;
  }

  return (
    <HashRouter>
      <ScrollToTopOnNavigate />
      {status === "signedIn" ? <PrivateRoutes /> : <PublicRoutes />}
    </HashRouter>
  );
}
