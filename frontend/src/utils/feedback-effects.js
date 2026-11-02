/** Som curto e vibração ao acertar/errar (respeita a preferência "Efeitos sonoros e vibrações"). */
let audioContext = null;

/**
 * Toca notas curtas com a Web Audio API (sem arquivos de som).
 */
function playTone(frequencies, durationSeconds) {
  try {
    audioContext ??= new AudioContext();
    const start = audioContext.currentTime;
    frequencies.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.12, start + index * durationSeconds);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (index + 1) * durationSeconds);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start + index * durationSeconds);
      oscillator.stop(start + (index + 1) * durationSeconds);
    });
  } catch {
    // sem áudio disponível: segue em silêncio
  }
}

/**
 * Som curto e vibração ao acertar/errar.
 * @param {boolean} correct
 * @param {boolean} enabled - preferência "Efeitos sonoros e vibrações".
 * Usado por: ActivityPage e modo prática/ensinar da câmera.
 */
export function playAnswerFeedback(correct, enabled) {
  if (!enabled) return;
  if (correct) playTone([660, 880], 0.12);
  else playTone([300, 220], 0.16);
  // Erro: vibração mais longa e em três batidas, para dar para sentir sem olhar a tela.
  navigator.vibrate?.(correct ? 40 : [90, 60, 90, 60, 90]);
}

/**
 * Fanfarra curta ao desbloquear uma conquista ou subir de nível.
 * @param {boolean} enabled - preferência "Efeitos sonoros e vibrações".
 * Usado por: AchievementToast (tela de resultado).
 */
export function playCelebrationFeedback(enabled) {
  if (!enabled) return;
  playTone([523, 659, 784, 1047], 0.1);
  navigator.vibrate?.([30, 30, 30, 30, 60]);
}
