const ICON_PATHS = {
  back: "M20 12H4.5M11 5l-7 7 7 7",
  close: "M18 6L6 18M6 6l12 12",
  bell: "M6 10a6 6 0 0112 0c0 5 2 6.5 2 6.5H4S6 15 6 10zM10 19.5a2 2 0 004 0",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  person: "M12 11.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM3.5 21.5c.4-4.7 4-7.5 8.5-7.5s8.1 2.8 8.5 7.5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.7M6.6 6.7A17 17 0 002 12s4 7 10 7c1.8 0 3.4-.5 4.8-1.2M9.9 9.9a3 3 0 004.2 4.2",
  book: "M2.5 4.5h7A2.5 2.5 0 0112 7v14a2.5 2.5 0 00-2.5-2.5h-7zM21.5 4.5h-7A2.5 2.5 0 0012 7v14a2.5 2.5 0 012.5-2.5h7z",
  chat: "M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3z",
  camera: "M2.5 7.5A2.5 2.5 0 015 5h2.5l1.6-2h5.8l1.6 2H19a2.5 2.5 0 012.5 2.5v10A2.5 2.5 0 0119 20H5a2.5 2.5 0 01-2.5-2.5zM12 16.5a4 4 0 100-8 4 4 0 000 8z",
  send: "M21.5 2.5L2.8 10.2l7.4 2.9M21.5 2.5l-6.1 18.7-5.2-8.1M21.5 2.5L10.2 13.1",
  check: "M5 12l5 5L20 7",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.5-4.5",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  location: "M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 21c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6zM18 14c-2-2.5-3-4-3-5.5a3 3 0 016 0c0 1.5-1 3-3 5.5z",
  flipCamera: "M20 11a8 8 0 00-14.6-4.5M4 4v3h3M4 13a8 8 0 0014.6 4.5M20 20v-3h-3M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  replay: "M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8M3 3v5h5",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  lockClosed: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  hand: "M8 13V5.5a1.5 1.5 0 013 0V11M11 10.5V4a1.5 1.5 0 013 0v6.5M14 10.5V5.5a1.5 1.5 0 013 0V13M8 13v-1.5a1.5 1.5 0 00-3 0V14a7 7 0 0014 0v-3.5a1.5 1.5 0 00-3 0",
};

/**
 * Ícone de traço (24x24). Para um ícone novo, acrescente o desenho em ICON_PATHS.
 * @param {{name: string, size?: number, filled?: boolean, strokeWidth?: number}} props
 */
export function Icon({ name, size = 20, filled = false, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
