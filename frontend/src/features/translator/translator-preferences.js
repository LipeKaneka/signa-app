import { readPreference, storePreference } from "../../utils/session-storage.js";

const HAND_ANALYSIS_SEEN_KEY = "hand-analysis-seen";

/**
 * @returns {boolean} se a análise da mão já foi feita ou pulada neste aparelho. Usado por: CameraPage.
 */
export function wasHandAnalysisSeen() {
  return readPreference(HAND_ANALYSIS_SEEN_KEY, false);
}

/**
 * Marca a análise da mão como vista (concluída ou pulada). Usado por: HandAnalysisPage.
 */
export function markHandAnalysisSeen() {
  storePreference(HAND_ANALYSIS_SEEN_KEY, true);
}
