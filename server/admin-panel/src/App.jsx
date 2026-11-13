import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import { Layout } from "./components/Layout.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { TrailPage } from "./pages/TrailPage.jsx";
import { ActivityEditorPage } from "./pages/ActivityEditorPage.jsx";
import { ExercisesPage } from "./pages/ExercisesPage.jsx";
import { SignsPage } from "./pages/SignsPage.jsx";
import { AchievementsPage } from "./pages/AchievementsPage.jsx";
import { EventsPage } from "./pages/EventsPage.jsx";
import { LevelsPage } from "./pages/LevelsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { NotificationsPage } from "./pages/NotificationsPage.jsx";
import { UsersPage } from "./pages/UsersPage.jsx";
import { UserDetailPage } from "./pages/UserDetailPage.jsx";
import { AuditPage } from "./pages/AuditPage.jsx";
import { DatabasePage } from "./pages/DatabasePage.jsx";
import { AdminsPage } from "./pages/AdminsPage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";

/** Rota que só aparece para quem tem a permissão (o servidor confere de novo em cada chamada). */
function Allowed({ permission, children }) {
  const { can } = useAuth();
  return can(permission) ? children : <Navigate to="/" replace />;
}

function Routing() {
  const { admin, checking } = useAuth();
  if (checking) return <p className="splash">Carregando o painel…</p>;
  if (!admin) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="trilha" element={<TrailPage />} />
        <Route path="exercicios" element={<ExercisesPage />} />
        <Route path="atividades/nova" element={<Allowed permission="content"><ActivityEditorPage /></Allowed>} />
        <Route path="atividades/:id" element={<ActivityEditorPage />} />
        <Route path="dicionario" element={<SignsPage />} />
        <Route path="conquistas" element={<AchievementsPage />} />
        <Route path="eventos" element={<EventsPage />} />
        <Route path="niveis" element={<LevelsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="notificacoes" element={<NotificationsPage />} />
        <Route path="usuarios" element={<UsersPage />} />
        <Route path="usuarios/:id" element={<UserDetailPage />} />
        <Route path="auditoria" element={<Allowed permission="manage"><AuditPage /></Allowed>} />
        <Route path="banco" element={<Allowed permission="manage"><DatabasePage /></Allowed>} />
        <Route path="administradores" element={<Allowed permission="admins"><AdminsPage /></Allowed>} />
        <Route path="conta" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Painel web do Signa Ludus (servido em /admin pelo servidor de gerenciamento). */
export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routing />
      </HashRouter>
    </AuthProvider>
  );
}
