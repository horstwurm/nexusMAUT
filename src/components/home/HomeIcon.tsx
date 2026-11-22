// Line icons for the homepage (24×24 grid, stroke in the current colour) – same style as nexusEAM.
const paths = {
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 010 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2",
  user: "M12 11.5a4 4 0 100-8 4 4 0 000 8zM4.5 21c.7-4 3.7-6.5 7.5-6.5s6.8 2.5 7.5 6.5",
  filter: "M3.5 5h17l-6.5 8v6l-4 2v-8L3.5 5z",
  route: "M6 19a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 10a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8.5 16.5h6a3.5 3.5 0 000-7h-5a3.5 3.5 0 010-7h6",
  steps: "M4 6h3v3H4zM10.5 7.5H20M4 15h3v3H4zM10.5 16.5H20M5.5 9v6",
  bolt: "M13 2.5L5 13.5h6l-1 8 8-11h-6l1-8z",
  braces: "M8 4c-2 0-2.5 1-2.5 3v2c0 1.5-.7 2.5-2 3 1.3.5 2 1.5 2 3v2c0 2 .5 3 2.5 3M16 4c2 0 2.5 1 2.5 3v2c0 1.5.7 2.5 2 3-1.3.5-2 1.5-2 3v2c0 2-.5 3-2.5 3",
  check: "M4 12.5l5 5L20 6.5",
  checklist: "M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M4 18.5l1.5 1.5L8 17.5M11 7h9M11 13h9M11 19h9",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4",
  coins: "M12 6c4.4 0 8-1.1 8-2.5S16.4 1 12 1 4 2.1 4 3.5 7.6 6 12 6zM4 3.5v5C4 9.9 7.6 11 12 11s8-1.1 8-2.5v-5M4 8.5v5C4 14.9 7.6 16 12 16s8-1.1 8-2.5v-5",
  layers: "M3 8l9-4.5L21 8l-9 4.5L3 8zM3 12.5l9 4.5 9-4.5M3 17l9 4.5 9-4.5",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  refresh: "M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4",
  dice: "M4.5 4.5h15v15h-15zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01",
  message: "M4 5h16v11H9l-5 4V5zM8 9.5h8M8 12.5h5",
  shield: "M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6l8-3zM8.5 12l2.5 2.5 4.5-5",
  lock: "M6 10.5h12v10H6zM8.5 10.5V7.5a3.5 3.5 0 017 0v3M12 14.5v2.5",
  key: "M15 9.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM14 12.5l7 7M18 16.5l2-2M16 14.5l1.5-1.5",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 01-2 1.2L14.8 20.5h-4l-.3-1.9a7 7 0 01-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 010-2.4L4.6 9.9l2-3.4 1.9.7a7 7 0 012-1.2L10.8 4h4l.3 1.9a7 7 0 012 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 010 2.5z",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  alert: "M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.5h.01",
} as const;

export type HomeIconName = keyof typeof paths;

export function HomeIcon({ name, size = 22 }: { name: HomeIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}
