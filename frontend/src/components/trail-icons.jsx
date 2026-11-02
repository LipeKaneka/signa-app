/**
 * Ícones simples (traço branco, sem 3D) dos quadrados roxos da trilha. O ícone é escolhido pelo título do módulo
 * ou da unidade; títulos novos criados no painel caem no ícone da mão.
 */
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };

const ICONS = {
  letters: (
    <>
      <path d="M6 30 L13 10 L20 30 M8.5 23 H17.5" />
      <path d="M24 10 V30 H29.5 A5 5 0 0 0 29.5 20 H24 M24 20 H28.5 A5 5 0 0 0 28.5 10 H24" />
    </>
  ),
  shuffle: (
    <>
      <path d="M6 12 H11 C17 12 19 28 25 28 H32 M28 24 L32 28 L28 32" />
      <path d="M6 28 H11 C13.5 28 15 25 16.5 22 M20 15.5 C21.3 13.5 23 12 25 12 H32 M28 8 L32 12 L28 16" />
    </>
  ),
  vowels: (
    <>
      <path d="M5 30 L11 12 L17 30 M7.2 24 H14.8" />
      <path d="M31 13 H22 V30 H31 M22 21.5 H29" />
    </>
  ),
  consonants: (
    <>
      <path d="M17 14 A8 8 0 1 0 17 28" />
      <path d="M23 12 V30 H26 A9 9 0 0 0 26 12 Z" />
    </>
  ),
  numbers: (
    <>
      <path d="M5 15 L9 12 V30 M5.5 30 H12.5" />
      <path d="M15 16 A4 4 0 0 1 23 16 C23 21 15 24 15 30 H23.5" />
      <path d="M27 13 H34 L30 19 A5.5 5.5 0 1 1 26.5 28" />
    </>
  ),
  review: (
    <>
      <path d="M31 14 A12 12 0 1 0 32 24" />
      <path d="M32 7 V14 H25" />
      <path d="M14 20.5 L18 24.5 L25.5 17" />
    </>
  ),
  colors: (
    <>
      <path d="M20 6 C10.5 6 5 12.5 5 20 C5 27.5 11 34 18.5 34 C21 34 21.5 32 20.5 30.5 C19.3 28.6 20.5 26.5 23 26.5 H27 C31.5 26.5 35 23.5 35 18.5 C35 11.5 28.5 6 20 6 Z" />
      <circle cx="12.5" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="26" cy="12.5" r="2" />
    </>
  ),
  animals: (
    <>
      <ellipse cx="20" cy="26" rx="7" ry="6" />
      <circle cx="10" cy="17" r="3" />
      <circle cx="16" cy="10.5" r="3" />
      <circle cx="24" cy="10.5" r="3" />
      <circle cx="30" cy="17" r="3" />
    </>
  ),
  greetings: (
    <>
      <path d="M13 22 V11 A2.2 2.2 0 0 1 17.4 11 V20 M17.4 19 V8.5 A2.2 2.2 0 0 1 21.8 8.5 V19 M21.8 19 V10 A2.2 2.2 0 0 1 26.2 10 V21 M26.2 21 V15 A2.2 2.2 0 0 1 30.6 15 V24 C30.6 30 26.5 34 21 34 C16.5 34 14 31.5 11.5 28 L8 23 A2.3 2.3 0 0 1 11.6 20.2 L13 22" />
      <path d="M5 9 Q7 6 9.5 5.5 M4 14 Q4.5 11.5 6 10.5" />
    </>
  ),
  words: (
    <>
      <path d="M7 9 H33 A2 2 0 0 1 35 11 V25 A2 2 0 0 1 33 27 H17 L10 33 V27 H7 A2 2 0 0 1 5 25 V11 A2 2 0 0 1 7 9 Z" />
      <path d="M12 16 H28 M12 21 H23" />
    </>
  ),
  camera: (
    <>
      <path d="M6 13 A2 2 0 0 1 8 11 H13 L16 7 H24 L27 11 H32 A2 2 0 0 1 34 13 V29 A2 2 0 0 1 32 31 H8 A2 2 0 0 1 6 29 Z" />
      <circle cx="20" cy="20.5" r="6" />
    </>
  ),
  hand: (
    <>
      <path d="M14 21 V9 A2.3 2.3 0 0 1 18.6 9 V19 M18.6 18 V6.5 A2.3 2.3 0 0 1 23.2 6.5 V18 M23.2 18 V9 A2.3 2.3 0 0 1 27.8 9 V21 M27.8 21 V15 A2.3 2.3 0 0 1 32.4 15 V24 C32.4 30 28 34 22.5 34 C18 34 15.5 31.5 13 28 L9 22.5 A2.3 2.3 0 0 1 12.6 19.7 L14 21" />
    </>
  ),
};

/** Palavras do título → ícone (a primeira que bater vale). */
const KEYWORDS = [
  [/aleat/i, "shuffle"],
  [/vogal|vogais/i, "vowels"],
  [/consoante/i, "consonants"],
  [/n[uú]mero/i, "numbers"],
  [/revis/i, "review"],
  [/cor(es)?\b/i, "colors"],
  [/anima/i, "animals"],
  [/cumpriment|sauda/i, "greetings"],
  [/c[aâ]mera|treino/i, "camera"],
  [/palavr|frase/i, "words"],
  [/alfabet|letra/i, "letters"],
];

/**
 * Ícone de traço simples para um módulo ou unidade, escolhido pelo título.
 * @param {{title: string, size?: number}} props
 * Usado por: TrailPage (módulos) e ModulePage (unidades).
 */
export function TrailIcon({ title, size = 34 }) {
  const name = KEYWORDS.find(([pattern]) => pattern.test(title))?.[1] ?? "hand";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" {...STROKE} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
