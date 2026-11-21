// Ilustrações do protótipo (logo, ícones coloridos) em SVG: nítidas em qualquer tela e offline no APK.
import { LOGO_HAND_PATHS, LOGO_HAND_VIEWBOX } from "./logo-hand-paths.js";
import sinalMao from "../assets/brand/sinal-de-libras 1.svg";
import logoColorida from "../assets/brand/logo-colorida.svg";
import tipografiaColorida from "../assets/brand/tipografia-colorida.svg";
import tipografiaBranca from "../assets/brand/tipografia-branca.svg";
import fogo from "../assets/elements/fogo.webp";
import fogoSequencia from "../assets/elements/fogo-sequencia.webp";
import barraXpHorizontal from "../assets/elements/barra-xp-horizontal.webp";
import barraXpVertical from "../assets/elements/barra-xp-vertical.webp";
import "./illustrations.css";

/** Mão da logo Signa Ludus (identidade visual nova, contornos preenchidos). color = currentColor por padrão. */
export function LogoHand({ size = 48, color = "currentColor" }) {
  return (
    <svg width={size} height={size * 248 / 180} viewBox={LOGO_HAND_VIEWBOX} aria-hidden="true">
      {LOGO_HAND_PATHS.map((path) => (
        <path key={path.d.slice(0, 24)} d={path.d} fill={color} stroke={color} strokeWidth={path.w} strokeLinejoin="round" />
      ))}
    </svg>
  )
}

/**
 * Logo completa: mão em degradê + "Signa Ludus" (tipografia da identidade visual).
 * No tema escuro o nome aparece em branco (o degradê some no fundo escuro).
 */
export function SignaLudusLogo({ height = 92 }) {
  return (
    <div className="brand-logo" style={{ height }} role="img" aria-label="Signa Ludus">
      <img src={logoColorida} alt="" style={{ height: height * 0.92 }} />
      <img src={tipografiaColorida} alt="" className="brand-logo__name brand-logo__name--color" style={{ height: height * 0.42 }} />
      <img src={tipografiaBranca} alt="" className="brand-logo__name brand-logo__name--white" style={{ height: height * 0.42 }} />
    </div>
  )
}

/** Nome "Signa Ludus" em branco (abertura do app, fundos roxos). */
export function BrandName({ height = 32 }) {
  return <img src={tipografiaBranca} alt="Signa Ludus" style={{ height, width: "auto" }} />
}

/** Quadrado roxo com a mão branca (ícone do app). */
export function AppIcon({ size = 100 }) {
  return (
    <div className="app-icon" style={{ width: size, height: size, borderRadius: size * 0.28 }} role="img" aria-label="Signa Ludus">
      <LogoHand size={size * 0.5} color="#fff" />
    </div>
  )
}

/** Duas mãos sinalizando (símbolo de língua de sinais), como no card “Libras” do dicionário. */
export function SignLanguageHands({ size = 116 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <rect x="1" y="1" width="118" height="118" rx="14" fill="#d9d9d9" stroke="var(--color-primary)" strokeWidth="1.5" />
      <image
        href={sinalMao}
        x="12"
        y="12"
        width="100"
        height="100"
      />
    </svg>
  )
}

/** Chama colorida (dias consecutivos). */
export function Flame({ size = 40 }) {
  return (
    <span className="flame" style={{ width: size, height: size }} aria-hidden="true">
      <img src={fogo} alt="" />
      <img src={fogoSequencia} alt="" />
    </span>
  )
}

/** Barra de XP horizontal (perfil). size = largura. */
export function XpIcon({ size = 50 }) {
  return <img className="xp-bar" src={barraXpHorizontal} alt="" width={size} aria-hidden="true" />
}

/** Barra de XP vertical (cabeçalho da trilha). size = altura. */
export function XpBarVertical({ size = 30 }) {
  return <img className="xp-bar" src={barraXpVertical} alt="" height={size} aria-hidden="true" />
}

/** Medalha com número (ranking). color = contorno. */
export function RankMedal({ position, size = 36, color = "currentColor", fill = "none" }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 30 36" fill="none" stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2 L13 15 M22 2 L17 15 M11 2 L15 12 L19 2" />
      <circle cx="15" cy="24" r="9" fill={fill} />
      {position != null && <text x="15" y="28.3" textAnchor="middle" fontSize="11" fill={color} stroke="none" fontFamily="Inter, sans-serif">{position}</text>}
    </svg>
  )
}

/** Medalha simples (ícone das conquistas, em quadrado roxo). */
export function AchievementMedal({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3 L13 13 M21 3 L17 13 M12 3 L15 10 L18 3" />
      <circle cx="15" cy="20" r="6.5" />
    </svg>
  )
}

/** Roseta com fitas (botão Conquistas do perfil). */
export function AwardIllustration({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <circle cx="20" cy="15" r="10" />
      <circle cx="20" cy="15" r="5.5" />
      <path d="M13.5 22.5 L11 36 L16.5 33 L20 37 L21.5 25 M26.5 22.5 L29 36 L23.5 33 L21.8 35" strokeLinecap="round" />
    </svg>
  )
}

/** Livro fechado (botão Dicionário). */
export function BookIllustration({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6 H32 V32 H11 A3 3 0 0 1 8 29 Z" />
      <path d="M8 29 A3 3 0 0 1 11 26 H32" />
      <path d="M17 11 H25" strokeLinecap="round" />
    </svg>
  )
}

/** Duas engrenagens (botão Configuração). */
export function GearsIllustration({ size = 44 }) {
  const buildGearPath = (cx, cy, r1, r2, n) => {
    const p = []
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI * i) / n
      const r = i % 2 ? r1 : r2
      const b = Math.PI / n / 2.4
      p.push([cx + r * Math.cos(a - b), cy + r * Math.sin(a - b)], [cx + r * Math.cos(a + b), cy + r * Math.sin(a + b)])
    }
    return 'M' + p.map(q => q.map(v => v.toFixed(2)).join(' ')).join(' L') + ' Z'
  }
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d={buildGearPath(28, 15, 9.5, 12.5, 8)} /><circle cx="28" cy="15" r="4.3" />
      <path d={buildGearPath(15, 29, 8.5, 11.5, 8)} /><circle cx="15" cy="29" r="3.8" />
    </svg>
  )
}

/** Logo do Google (botão de entrar com Google). */
export function GoogleLogo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

/** Desenho da mão a partir de 21 pontos normalizados (amostras reais de referência). */
export function HandDrawing({ points, size = 120 }) {
  if (!points) return null
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const k = 0.82 / Math.max(x1 - x0, y1 - y0)
  const P = points.map(p => [0.5 + (p[0] - (x0 + x1) / 2) * k, 0.5 + (p[1] - (y0 + y1) / 2) * k])
  const dedos = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]]
  return (
    <svg width={size} height={size} viewBox="0 0 1 1" aria-hidden="true">
      <g fill="none" stroke="#1d1d1d" strokeWidth="0.06" strokeLinecap="round" strokeLinejoin="round">
        {dedos.map((d, i) => <polyline key={i} points={d.map(j => P[j].join(',')).join(' ')} />)}
      </g>
      <g fill="none" stroke="#fff" strokeWidth="0.032" strokeLinecap="round" strokeLinejoin="round">
        {dedos.map((d, i) => <polyline key={i} points={d.map(j => P[j].join(',')).join(' ')} />)}
      </g>
    </svg>
  )
}
