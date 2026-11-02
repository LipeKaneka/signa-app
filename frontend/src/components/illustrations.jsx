// Ilustrações do protótipo (logo, ícones coloridos) em SVG: nítidas em qualquer tela e offline no APK.
import { LOGO_HAND_PATHS, LOGO_HAND_VIEWBOX } from "./logo-hand-paths.js";
import logoColorida from "../assets/brand/logo-colorida.svg";
import tipografiaColorida from "../assets/brand/tipografia-colorida.svg";
import tipografiaBranca from "../assets/brand/tipografia-branca.svg";

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
      <g fill="var(--color-primary)">
        {/* mão de trás (aberta, de cima) */}
        <path d="M46 84 C34 82 25 73 22 61 L13 34 C11.5 29 17.5 26.5 20 31 L30 52 L25 20 C24.3 14.5 31.5 13.2 32.8 18.8 L39.5 46 L41 12 C41.3 6 48.8 6.3 48.8 12.3 L48.5 46 L56.5 18 C58.3 12.6 65 15 63.5 20.5 L56 50 C55 56 58 60 63 58 L72 56 C64 62 60 70 64 78 C58 83 52 85 46 84 Z" />
        {/* mão da frente (de baixo, inclinada) */}
        <path d="M62 58 C67 52 75 49 83 49.5 L96 50 C101 50.3 104 54 104 59 L103 74 C102.5 82 98 89 92 94 L99 112 C100.8 117 94 119.5 92 114.6 L84 97 L86 113 C86.5 118.8 79 119.6 78.5 113.8 L76 96 L71 110 C69 115.5 62 113.5 64 108 L69 93 L60 103 C56.5 107 51 102.5 54.5 98.5 L68 82 C64 77 61 70 66 64 L62 58 Z" />
      </g>
      <g fill="none" stroke="var(--color-primary)" strokeWidth="2.6" strokeLinecap="round">
        <path d="M105 46 Q110 54 106 62" /><path d="M110 42 Q117 54 111 66" />
        <path d="M14 84 Q18 92 26 93" /><path d="M10 90 Q15 100 26 100" />
      </g>
    </svg>
  )
}

/** Chama colorida (dias consecutivos). */
export function Flame({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <linearGradient id="gchama" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a7a" /><stop offset="1" stopColor="#f2543d" />
        </linearGradient>
      </defs>
      <path fill="url(#gchama)" d="M20 2 C22 10 31 15 33 25 C35.5 36 28.5 44.5 19.5 44.5 C10 44.5 4 37 6 27.5 C7 22.5 10 19.5 12.5 17 C12.5 21.5 14 24.5 17 25.5 C15.5 17.5 18 9.5 20 2 Z" />
      <path fill="#fff" d="M20.5 26 C22 30 26 32 25.5 37 C25 40.5 22.5 42.5 19.5 42.5 C16 42.5 13.5 39.8 14.3 36 C14.8 33.8 16.3 32.3 17.5 31.2 C17.7 33 18.6 34.2 19.8 34.6 C19.2 31.5 19.6 28.5 20.5 26 Z" opacity=".85" />
    </svg>
  )
}

/** Ícone de XP (etiqueta verde com seta para cima). */
export function XpIcon({ size = 50 }) {
  return (
    <svg width={size} height={size * 0.5} viewBox="0 0 60 30" fill="none" stroke="#2fc81a" strokeWidth="2.4" aria-hidden="true">
      <rect x="16" y="9" width="40" height="12" rx="6" />
      <path d="M26 12.5 V17.5 M31 12.5 V17.5 M36 12.5 V17.5" strokeLinecap="round" />
      <circle cx="15" cy="15" r="12" fill="#fff" />
      <circle cx="15" cy="15" r="8.2" />
      <path d="M15 19.5 V11 M11.3 14.4 L15 10.7 L18.7 14.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
