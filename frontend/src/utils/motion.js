/**
 * @returns {boolean} true quando o aparelho pede menos movimento (acessibilidade).
 * Usado por: AssistantPage (rolagem sem animação).
 */
export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
