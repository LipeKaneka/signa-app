import * as UserApi from "../../api/api-user.js";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { ErrorState, LoadingState, ScreenWithNav } from "../../components/layout.jsx";
import { AchievementCard, sortByUnlockDate } from "../../components/AchievementCard.jsx";
import "./achievements.css";

/**
 * Conquistas: desbloqueadas (mais recentes primeiro, com a data) e bloqueadas (mais claras).
 * O catálogo vem do backend (GET /profile): conquistas criadas no painel aparecem sem atualizar o app.
 */
export function AchievementsPage() {
  const { data, error, loading, reload } = useAsyncData(UserApi.fetchProfile);
  const unlocked = data ? sortByUnlockDate(data.achievements) : [];
  const locked = data ? data.achievements.filter((achievement) => !achievement.unlocked) : [];

  return (
    <ScreenWithNav title="Conquistas" backTo={-1} headerRounded contentClassName="page-content achievements-content">
      {loading && <LoadingState message="Carregando as conquistas…" />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <>
          <h2 className="achievements-section-title">Desbloqueadas</h2>
          {unlocked.length > 0 ? (
            <ul className="achievement-list achievement-list--dated">
              {unlocked.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} showDate />
              ))}
            </ul>
          ) : (
            <p className="achievement-empty">Nenhuma conquista ainda. Conclua atividades na trilha para ganhar a primeira!</p>
          )}

          {locked.length > 0 && (
            <>
              <h2 className="achievements-section-title">Bloqueadas</h2>
              <ul className="achievement-list achievement-list--locked">
                {locked.map((achievement) => (
                  <AchievementCard key={achievement.id} achievement={achievement} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </ScreenWithNav>
  );
}
