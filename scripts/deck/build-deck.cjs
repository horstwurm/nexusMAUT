// Builds the sales presentation nexusMAUT-Uebersicht.pptx (German) from the screenshots in
// scripts/deck/screenshots:   node scripts/deck/build-deck.cjs
// The screenshots show the demo database (fictional «Musterbank» customers, demo users Lea Keller /
// Marco Brunner) – never the production data. Icons are the app's own line icons
// (src/components/home/HomeIcon.tsx), rendered with sharp.
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
const { applyTheme } = require("./apply-theme.cjs");

const ROOT = path.join(__dirname, "..", "..");
const SHOTS = path.join(__dirname, "screenshots");
const OUT = path.join(ROOT, "nexusMAUT-Uebersicht.pptx");

// The app's palette: petrol accent on navy text, status colours as in the app.
const THEME = {
  name: "nexusMAUT",
  headFontFace: "Arial",
  bodyFontFace: "Arial",
  colors: {
    dk1: "1B2033", lt1: "FFFFFF", dk2: "0F1220", lt2: "F4F5F9",
    accent1: "0C8599", // petrol – the app's accent
    accent2: "2B8A3E", // ok / erledigt
    accent3: "C92A2A", // danger / Ausführen
    accent4: "B07800", // warn / ausgesetzt
    accent5: "646B80", // muted
    accent6: "F59F00", // service ⚡
    hlink: "0C8599", folHlink: "0C8599",
  },
};
const INK = "1B2033", NAVY = "0F1220", MUTED = "646B80", ACCENT = "0C8599", LIGHT = "F4F5F9", LINE = "DDE1EA", RED = "C92A2A";

// ---- Icons (paths from HomeIcon.tsx) ----
const ICON_PATHS = {
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
  arrow: "M5 12h14M13 6l6 6-6 6",
  alert: "M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.5h.01",
  send: "M3.5 11.5L21 4l-6.5 17-3-7.5-8-2zM11.5 13.5L21 4",
};
const iconCache = new Map();
/** The icon as a PNG data URL: white on a petrol circle (default) or plain in `color`. */
async function icon(name, { circle = true, color = "FFFFFF", bg = ACCENT } = {}) {
  const key = `${name}-${circle}-${color}-${bg}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const inner = `<path d="${ICON_PATHS[name]}" fill="none" stroke="#${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const svg = circle
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#${bg}"/><g transform="translate(8 8)">${inner}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24">${inner}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const data = `image/png;base64,${png.toString("base64")}`;
  iconCache.set(key, data);
  return data;
}

// ---- Screenshots ----
const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
/** A screenshot fitted into the box (aspect kept, top-left unless `center`), on a white card with a soft shadow; optional caption. */
function shot(slide, file, box, { caption, center = false, name } = {}) {
  const full = path.join(SHOTS, file);
  const { w: pw, h: ph } = pngSize(full);
  const capH = caption ? 0.34 : 0;
  const pad = 0.06;
  const scale = Math.min((box.w - 2 * pad) / pw, (box.h - capH - 2 * pad) / ph);
  const w = pw * scale, h = ph * scale;
  const x = center ? box.x + (box.w - w - 2 * pad) / 2 : box.x;
  slide.addShape("rect", {
    x, y: box.y, w: w + 2 * pad, h: h + 2 * pad,
    fill: { color: "FFFFFF" }, line: { color: LINE, width: 0.75 },
    shadow: { type: "outer", color: "1B2033", opacity: 0.14, blur: 10, offset: 3, angle: 90 },
    objectName: `${name ?? file} frame`,
  });
  slide.addImage({ path: full, x: x + pad, y: box.y + pad, w, h, altText: caption ?? file, objectName: name ?? file });
  if (caption) {
    slide.addText(caption, {
      x, y: box.y + h + 2 * pad + 0.08, w: Math.max(w + 2 * pad, 3.5), h: 0.26,
      fontSize: 11, italic: true, color: MUTED, margin: 0, isTextBox: true, objectName: `${name ?? file} caption`,
    });
  }
  return { x, y: box.y, w: w + 2 * pad, h: h + 2 * pad + capH };
}

/** Feature rows: icon in a petrol circle, text beside it. */
async function features(slide, items, { x, y, w, rowH = 0.8, size = 14 }) {
  for (const [i, [ic, text]] of items.entries()) {
    const top = y + i * rowH;
    slide.addImage({ data: await icon(ic), x, y: top + 0.02, w: 0.36, h: 0.36, altText: "", objectName: `feature icon ${i + 1}` });
    slide.addText(text, { x: x + 0.52, y: top - 0.02, w: w - 0.52, h: rowH - 0.05, fontSize: size, color: INK, valign: "top", margin: 0, isTextBox: true, objectName: `feature ${i + 1}` });
  }
}

/** A card with icon (left of the heading when `compact`), bold heading and text. */
async function card(slide, { x, y, w, h, ic, title, text, fill = LIGHT, dark = false, compact = false }) {
  slide.addShape("rect", { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: `card ${title}` });
  const iconOpts = dark ? { bg: "FFFFFF", color: NAVY } : {};
  if (compact) {
    slide.addImage({ data: await icon(ic, iconOpts), x: x + 0.25, y: y + 0.25, w: 0.42, h: 0.42, altText: "", objectName: `card icon ${title}` });
    slide.addText(title, { x: x + 0.85, y: y + 0.24, w: w - 1.05, h: 0.44, fontSize: 16, bold: true, color: dark ? "FFFFFF" : INK, valign: "middle", margin: 0, isTextBox: true, objectName: `card title ${title}` });
    slide.addText(text, { x: x + 0.85, y: y + 0.72, w: w - 1.05, h: h - 0.85, fontSize: 13, color: dark ? "D5D8E3" : "3A4054", valign: "top", margin: 0, isTextBox: true, objectName: `card text ${title}` });
    return;
  }
  if (ic) slide.addImage({ data: await icon(ic, iconOpts), x: x + 0.25, y: y + 0.25, w: 0.42, h: 0.42, altText: "", objectName: `card icon ${title}` });
  const top = y + (ic ? 0.85 : 0.25);
  slide.addText(title, { x: x + 0.25, y: top, w: w - 0.5, h: 0.4, fontSize: 16, bold: true, color: dark ? "FFFFFF" : INK, margin: 0, isTextBox: true, objectName: `card title ${title}` });
  slide.addText(text, { x: x + 0.25, y: top + 0.44, w: w - 0.5, h: h - (top - y) - 0.6, fontSize: 13, color: dark ? "D5D8E3" : "3A4054", valign: "top", margin: 0, isTextBox: true, objectName: `card text ${title}` });
}

/** A small label like the app's badges (square: Quick Look previews can't draw rounded shapes). */
function badge(slide, text, { x, y, w, fill, color, size = 11 }) {
  slide.addShape("rect", { x, y, w, h: 0.32, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: `badge ${text}` });
  slide.addText(text, { x, y, w, h: 0.32, fontSize: size, bold: true, color, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `badge text ${text}` });
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in, like the nexusAd and nexusEAM decks
  pres.title = "nexusMAUT – Übersicht";
  pres.subject = "Marketing Automation: Kunden, Selektionen, Journeys";
  pres.author = "nexusMAUT";
  pres.company = "nexusMAUT";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };

  // ---- Layouts ----
  pres.defineSlideMaster({
    title: "DARK",
    background: { color: NAVY },
    objects: [
      { placeholder: { options: { name: "eyebrow", type: "body", x: 0.7, y: 0.6, w: 11.9, h: 0.35, fontSize: 11, color: "8FD3DE", charSpacing: 3, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 1.9, w: 6.9, h: 2.6, fontSize: 46, bold: true, color: "FFFFFF", align: "left", valign: "bottom", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 4.7, w: 6.5, h: 1.3, fontSize: 17, color: "C9CDDA", align: "left", valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: "FFFFFF" },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: "eyebrow", type: "body", x: 0.6, y: 0.38, w: 9, h: 0.3, fontSize: 10.5, bold: true, color: ACCENT, charSpacing: 3, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.7, w: 12.1, h: 0.75, fontSize: 32, bold: true, color: INK, align: "left", valign: "top", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 1.45, w: 12.0, h: 0.55, fontSize: 15, color: MUTED, align: "left", valign: "top", margin: 0 }, text: "" } },
      { text: { text: "nexusMAUT", options: { x: 0.6, y: 7.02, w: 3, h: 0.25, fontSize: 9, bold: true, color: MUTED, charSpacing: 2, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.25, fontSize: 9, color: MUTED, align: "right" },
  });

  const content = (section, eyebrow, title, lead) => {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
    s.addText(eyebrow.toUpperCase(), { placeholder: "eyebrow" });
    s.addText(title, { placeholder: "title" });
    if (lead) s.addText(lead, { placeholder: "body" });
    return s;
  };

  // ======== Einstieg ========
  pres.addSection({ title: "Einstieg" });
  {
    const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Einstieg" });
    s.addText("NEXUSMAUT · MARKETING AUTOMATION", { placeholder: "eyebrow" });
    s.addText("Die richtigen Kunden. Im richtigen Moment.", { placeholder: "title" });
    s.addText("Zielgruppen aus Kunden-, Positions- und Transaktionsdaten finden, Werte aus Ihren Systemen dazuholen – und jeden Kunden mit persönlichen Journeys begleiten.", { placeholder: "body" });
    s.addText("Kunden · Selektionen · Journeys · Ausführen · Feedback", { x: 0.7, y: 6.55, w: 8, h: 0.35, fontSize: 13, color: "9AA0B8", margin: 0, isTextBox: true, objectName: "tagline" });
    // decorative: customers → Selektion → journey steps (as on the homepage)
    const gx = 8.3, gy = 1.6, picked = new Set([3, 9, 12, 20, 26, 31, 37, 44]);
    s.addShape("rect", { x: 8.0, y: 1.2, w: 4.75, h: 5.0, fill: { color: "171B2D" }, line: { color: "262B42", width: 0.75 }, objectName: "hero panel" });
    s.addText("KUNDEN", { x: gx, y: gy - 0.12, w: 2, h: 0.2, fontSize: 8, color: "8A90A8", charSpacing: 2, margin: 0, isTextBox: true, objectName: "hero label kunden" });
    for (let i = 0; i < 48; i++) {
      const on = picked.has(i);
      s.addShape("rect", { x: gx + (i % 8) * 0.27, y: gy + 0.2 + Math.floor(i / 8) * 0.27, w: 0.15, h: 0.15, fill: { color: on ? "3BC9DB" : "3A4058" }, line: { color: on ? "3BC9DB" : "3A4058", width: 0 }, objectName: `dot ${i}` });
    }
    s.addShape("rect", { x: 10.85, y: 2.05, w: 1.6, h: 0.75, fill: { color: "0F1220" }, line: { color: "3BC9DB", width: 1.5 }, objectName: "hero selektion" });
    s.addText([{ text: "Selektion", options: { bold: true, color: "FFFFFF", breakLine: true } }, { text: "8 Treffer", options: { color: "9AA0B8", fontSize: 10 } }], { x: 10.85, y: 2.05, w: 1.6, h: 0.75, fontSize: 13, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "hero selektion text" });
    s.addText("JOURNEY", { x: gx, y: 4.15, w: 2, h: 0.2, fontSize: 8, color: "8A90A8", charSpacing: 2, margin: 0, isTextBox: true, objectName: "hero label journey" });
    const steps = [["Brief", true], ["Anruf", true], ["Termin", false], ["Feedback", false]];
    s.addShape("line", { x: gx + 0.3, y: 4.85, w: 3.45, h: 0, line: { color: "3A4058", width: 2 }, objectName: "hero line" });
    for (const [i, [label, done]] of steps.entries()) {
      const x = gx + i * 1.15;
      s.addShape("rect", { x, y: 4.55, w: 0.6, h: 0.6, fill: { color: done ? "0C8599" : "0F1220" }, line: { color: done ? "0C8599" : "3A4058", width: 1.25 }, objectName: `hero step ${label}` });
      if (done) s.addImage({ data: await icon("check", { circle: false, color: "FFFFFF" }), x: x + 0.13, y: 4.68, w: 0.34, h: 0.34, altText: "", objectName: `hero check ${label}` });
      else s.addText(String(i + 1), { x, y: 4.55, w: 0.6, h: 0.6, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `hero num ${label}` });
      s.addText(label, { x: x - 0.25, y: 5.25, w: 1.1, h: 0.3, fontSize: 10, color: "9AA0B8", align: "center", margin: 0, isTextBox: true, objectName: `hero step label ${label}` });
    }
    s.addNotes("nexusMAUT ist eine schlanke Marketing-Automation: Kunden finden, die zu einem Anliegen passen, und sie Schritt für Schritt begleiten – vom Brief bis zum Feedback.");
  }

  {
    const s = content("Einstieg", "Warum", "Kundendaten sind da – nur nicht beisammen", "Produkte im Kernsystem, Kontakte im CRM, Aktionen in Listen. nexusMAUT bringt Daten, Zielgruppe und Ablauf zusammen.");
    const pains = [
      ["Listen statt Zielgruppen", "Wer bekommt das Angebot? Jede Kampagne beginnt mit einem Export und viel Handarbeit."],
      ["Abläufe im Kopf", "Brief, Anruf, Termin – wer ist wo? Der Stand steckt in E-Mails und Tabellen."],
      ["Feedback geht verloren", "Was hat der Kunde gesagt? Antworten landen beim Callcenter, nicht beim Marketing."],
    ];
    const gains = [
      ["Selektionen auf Knopfdruck", "Bedingungen auf Kunde, Positionen und Transaktionen – mit den aktuellen Treffern."],
      ["Journeys für jeden Kunden", "Jeder Schritt mit Status, persönlichem Inhalt und Datenprüfung."],
      ["Feedback mit Bedeutung", "Von Lead bis Kein Interesse – direkt vom ausführenden System zurückgemeldet."],
    ];
    s.addText("HEUTE", { x: 0.6, y: 2.25, w: 5.6, h: 0.3, fontSize: 11, bold: true, color: MUTED, charSpacing: 3, margin: 0, isTextBox: true, objectName: "today label" });
    s.addText("MIT NEXUSMAUT", { x: 6.85, y: 2.25, w: 5.9, h: 0.3, fontSize: 11, bold: true, color: ACCENT, charSpacing: 3, margin: 0, isTextBox: true, objectName: "with label" });
    for (const [i, [t, d]] of pains.entries()) await card(s, { x: 0.6, y: 2.7 + i * 1.4, w: 5.75, h: 1.25, title: t, text: d, fill: LIGHT });
    for (const [i, [t, d]] of gains.entries()) await card(s, { x: 6.85, y: 2.7 + i * 1.4, w: 5.9, h: 1.25, title: t, text: d, fill: NAVY, dark: true });
    s.addText("→", { x: 6.33, y: 4.1, w: 0.55, h: 0.5, fontSize: 26, color: ACCENT, align: "center", margin: 0, isTextBox: true, objectName: "arrow" });
    s.addNotes("Der typische Ausgangspunkt: Die Daten existieren, aber Zielgruppe, Ablauf und Rückmeldung leben an verschiedenen Orten.");
  }

  {
    const s = content("Einstieg", "Auf einen Blick", "Von der Zielgruppe bis zum Feedback", "Fünf Schritte – alles in einer Anwendung, im Browser.");
    const flow = [
      ["users", "Kunden", "mit Produkten, Positionen, Transaktionen und Attributen"],
      ["filter", "Selektion", "findet die Zielgruppe nach Ihren Bedingungen"],
      ["route", "Journey", "Schritte mit Aktion, Inhalt und Feedback-Optionen"],
      ["send", "Ausführen", "übergibt bereite Schritte an das System der Aktion"],
      ["message", "Feedback", "kommt mit Bedeutung zurück – von Lead bis Kein Interesse"],
    ];
    const w = 2.25, gap = 0.21;
    for (const [i, [ic, t, d]] of flow.entries()) {
      const x = 0.6 + i * (w + gap);
      s.addShape("rect", { x, y: 2.35, w, h: 2.6, fill: { color: i === 3 ? NAVY : LIGHT }, line: { color: i === 3 ? NAVY : LIGHT, width: 0 }, objectName: `flow ${t}` });
      s.addImage({ data: await icon(ic, i === 3 ? { bg: RED } : {}), x: x + 0.25, y: 2.6, w: 0.55, h: 0.55, altText: "", objectName: `flow icon ${t}` });
      s.addText(`${i + 1}  ${t}`, { x: x + 0.25, y: 3.35, w: w - 0.4, h: 0.4, fontSize: 17, bold: true, color: i === 3 ? "FFFFFF" : INK, margin: 0, isTextBox: true, objectName: `flow title ${t}` });
      s.addText(d, { x: x + 0.25, y: 3.8, w: w - 0.45, h: 1.0, fontSize: 13, color: i === 3 ? "D5D8E3" : "3A4054", valign: "top", margin: 0, isTextBox: true, objectName: `flow text ${t}` });
      if (i < flow.length - 1) s.addText("›", { x: x + w - 0.02, y: 3.35, w: gap + 0.04, h: 0.4, fontSize: 20, bold: true, color: ACCENT, align: "center", margin: 0, isTextBox: true, objectName: `flow arrow ${i}` });
    }
    const stats = [["5", "Status pro Schritt – vom Vorschlag bis Erledigt"], ["6", "Feedback-Bedeutungen von Lead bis Kein Interesse"], ["1", "Klick «Ausführen» für alle bereiten Schritte"], ["0", "Installation – läuft im Browser"]];
    stats.forEach(([n, l], i) => {
      const x = 0.6 + i * 3.08;
      s.addText(n, { x, y: 5.3, w: 0.9, h: 1.0, fontSize: 54, bold: true, color: ACCENT, margin: 0, isTextBox: true, objectName: `stat ${i}` });
      s.addText(l, { x: x + 0.85, y: 5.45, w: 2.05, h: 0.85, fontSize: 13, color: "3A4054", valign: "middle", margin: 0, isTextBox: true, objectName: `stat label ${i}` });
    });
    s.addNotes("Der ganze Weg in fünf Stationen. Das ausführende System – Druckerei, Kundencenter, E-Mail-Versand – bleibt das, was Sie schon haben.");
  }

  {
    const s = content("Einstieg", "So funktioniert's", "In vier Schritten startklar", "Kein Projekt, keine Installation – anmelden und loslegen.");
    const steps = [
      ["Anmelden", "Mit E-Mail und Passwort oder über nexusIdentity. Die erste Person wird Admin, weitere erhalten eine Rolle."],
      ["Datenmodell einrichten", "Kundenattribute, Produkttypen, Services und Aktionen – in der Administration, ohne Programmierung."],
      ["Zielgruppe finden", "Kunden Selektion definieren, Treffer prüfen, Journey zuweisen."],
      ["Begleiten und ausführen", "Status setzen, Daten prüfen, «Ausführen» – das Feedback kommt zurück."],
    ];
    steps.forEach(([t, d], i) => {
      const y = 2.3 + i * 1.1;
      s.addShape("rect", { x: 0.6, y, w: 0.62, h: 0.62, fill: { color: ACCENT }, line: { color: ACCENT, width: 0 }, objectName: `step ${i + 1}` });
      s.addText(String(i + 1), { x: 0.6, y, w: 0.62, h: 0.62, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `step number ${i + 1}` });
      s.addText(t, { x: 1.45, y: y - 0.02, w: 4.7, h: 0.35, fontSize: 16, bold: true, color: INK, margin: 0, isTextBox: true, objectName: `step title ${i + 1}` });
      s.addText(d, { x: 1.45, y: y + 0.34, w: 4.7, h: 0.65, fontSize: 13, color: "3A4054", valign: "top", margin: 0, isTextBox: true, objectName: `step text ${i + 1}` });
    });
    shot(s, "mau-start.png", { x: 6.5, y: 2.2, w: 6.2, h: 4.65 }, { caption: "Startseite: «Heute – was ansteht» mit den dringendsten KundenJourneys" });
    s.addNotes("Nach dem Anmelden zeigt die Startseite, was heute ansteht: aktive KundenJourneys, offene Schritte, Datenfehler – und eine Kachel pro Bereich.");
  }

  // ======== 01 Kunden ========
  pres.addSection({ title: "Kunden" });
  {
    const s = content("Kunden", "01 · Kunden", "Jeder Kunde mit allem, was zählt", "Kunden mit Produkten, Positionen und Transaktionen – aufklappbar in einer Liste, direkt bearbeitbar.");
    shot(s, "mau-customers.png", { x: 0.6, y: 2.15, w: 7.5, h: 4.75 }, { caption: "Kundenübersicht: Kunde → Positionen → Transaktionen, Bonität vom Service" });
    await features(s, [
      ["layers", "Positionen und Transaktionen pro Produkttyp mit eigenen Attributen: Text, Zahl, Datum, Ja/Nein, Auswahl"],
      ["sliders", "Kundenattribute wie Anrede oder Segment – in Formular, Liste, Selektion und Platzhaltern"],
      ["message", "Produkte und Kommunikationspräferenzen pro Kunde"],
      ["dice", "100 Beispielkunden zum Ausprobieren – mit einem Befehl angelegt und wieder entfernt"],
    ], { x: 8.5, y: 2.3, w: 4.25, rowH: 1.05 });
    s.addNotes("Das Datenmodell bestimmen Sie: Produkttypen und ihre Attribute legt die Administration fest, ohne Programmierung.");
  }
  {
    const s = content("Kunden", "01 · Kunden", "Werte aus Ihren Systemen – mit Mock-Schalter", "Services liefern Attribute wie die Bonität. Gespeichert, als «echt» oder «Mock» markiert und auf Knopfdruck aktualisiert.");
    shot(s, "mau-services.png", { x: 0.6, y: 2.15, w: 7.3, h: 4.75 }, { caption: "Administration → Services: PUT- und GET-Attribute, Testen, Mock" });
    await features(s, [
      ["bolt", "«Service»-Attribute bei Kunde, Position und Transaktion – Typ und Auswahl kommen vom Service"],
      ["dice", "Mock-Schalter: Zufallswerte, solange die echte Schnittstelle noch fehlt"],
      ["refresh", "«Daten aktualisieren» holt alle Werte neu; Fehler werden vermerkt, alte Werte bleiben"],
      ["server", "Aufrufe auf dem Server, Antworten auch als Liste mit Spalten"],
    ], { x: 8.3, y: 2.3, w: 4.45, rowH: 1.05 });
    s.addNotes("Mit Mock lassen sich Selektionen und Journeys schon testen, bevor die Schnittstelle bereitsteht. Jeder Wert zeigt, woher er kommt.");
  }

  // ======== 02 Selektionen ========
  pres.addSection({ title: "Selektionen" });
  {
    const s = content("Selektionen", "02 · Kunden Selektionen", "Die richtige Zielgruppe in Sekunden", "Bedingungen auf Kunde, Positionen und Transaktionen – alle oder mindestens eine erfüllt, mit den aktuellen Treffern.");
    shot(s, "mau-rule-editor.png", { x: 0.6, y: 2.15, w: 5.3, h: 4.75 }, { caption: "«Sparer ohne Depot»: Sparkonto ja, Depot nein" });
    await card(s, { x: 6.3, y: 2.25, w: 3.1, h: 2.15, ic: "calendar", title: "Zeit und Jahrestage", text: "«heute», Zeiträume, Geburtstag in den nächsten 30 Tagen." });
    await card(s, { x: 9.6, y: 2.25, w: 3.15, h: 2.15, ic: "coins", title: "Summen und Anzahl", text: "Kartenumsatz der letzten 90 Tage ≥ CHF 1'000." });
    await card(s, { x: 6.3, y: 4.6, w: 3.1, h: 2.15, ic: "bolt", title: "Service-Werte", text: "z.B. Bonitätsstufe A – wie jedes andere Attribut." });
    await card(s, { x: 9.6, y: 4.6, w: 3.15, h: 2.15, ic: "eye", title: "Treffer vorab prüfen", text: "Die ersten Kunden sehen, bevor die Selektion gilt." });
    s.addNotes("Selektionen werden immer frisch ausgewertet – wer heute dazugehört, ist morgen vielleicht nicht mehr dabei.");
  }

  // ======== 03 Journeys ========
  pres.addSection({ title: "Journeys" });
  {
    const s = content("Journeys", "03 · Journeys", "Abläufe mit persönlichem Inhalt", "Eine Journey ist eine Folge von Schritten: Aktion, Inhalt mit Platzhaltern und die möglichen Feedbacks des Kunden.");
    shot(s, "mau-journey-steps.png", { x: 0.6, y: 2.15, w: 12.1, h: 4.75 }, { caption: "Journey «Willkommen Neukunden»: Brief, Anruf, Einladung – mit Feedback-Optionen", center: true });
    s.addNotes("Platzhalter wie {{Kunde.Nachname}} oder {{Kunde.Bonität}} werden für jeden Kunden gefüllt. Unbekannte Platzhalter markiert der Editor sofort.");
  }
  {
    const s = content("Journeys", "03 · Journeys", "Testen, bevor ein Kunde es sieht", "Jeder Schritt lässt sich für einen echten Kunden aufbereiten – und jede Antwort des Kunden hat eine Bedeutung.");
    shot(s, "mau-step-test.png", { x: 0.6, y: 2.15, w: 6.9, h: 2.75 }, { caption: "Schritt testen: alle Platzhalter gefüllt, Bonität vom Service" });
    shot(s, "mau-feedback-options.png", { x: 7.9, y: 2.15, w: 2.6, h: 4.75 }, { caption: "Feedback-Optionen" });
    const meanings = [["Lead", "E6F4EA", "2B8A3E"], ["Chance", "E6F4EA", "2B8A3E"], ["Interesse", "E3F4F7", ACCENT], ["Indifferent", "EEF0F4", MUTED], ["Kein Interesse aktuell", "FFF4DB", "8A5A00"], ["Kein Interesse", "FDECEC", RED]];
    s.addText("BEDEUTUNGEN", { x: 10.85, y: 2.2, w: 1.9, h: 0.3, fontSize: 10, bold: true, color: MUTED, charSpacing: 2, margin: 0, isTextBox: true, objectName: "meanings label" });
    meanings.forEach(([t, fill, color], i) => badge(s, t, { x: 10.85, y: 2.6 + i * 0.5, w: 1.9, fill, color, size: 10.5 }));
    await features(s, [
      ["braces", "Platzhalter für Kunde, Produkte, Positionen, Transaktionen und Services – auch Listen mit Summen"],
      ["check", "Gefüllte und fehlende Werte farbig markiert"],
    ], { x: 0.6, y: 5.45, w: 6.9, rowH: 0.7, size: 13.5 });
    s.addNotes("Die Bedeutungen machen Feedback auswertbar: Leads und Chancen gehen an den Vertrieb, «Kein Interesse aktuell» kommt später wieder.");
  }

  // ======== 04 KundenJourneys ========
  pres.addSection({ title: "KundenJourneys" });
  {
    const s = content("KundenJourneys", "04 · KundenJourneys", "Jeden Kunden auf seiner Journey begleiten", "Journey einer Selektion oder einzelnen Kunden zuweisen – und pro Kunde sehen, wo er steht.");
    shot(s, "mau-cj.png", { x: 0.6, y: 2.15, w: 12.1, h: 4.75 }, { caption: "Journeys links, rechts die KundenJourneys mit Fortschritt, Datenfehlern, «Daten prüfen» und «Ausführen»", center: true });
    s.addNotes("Wer die Journey schon aktiv hat, wird beim Zuweisen übersprungen. Die Schritte werden kopiert – spätere Änderungen an der Vorlage verändern laufende Journeys nicht.");
  }
  {
    const s = content("KundenJourneys", "04 · KundenJourneys", "Status, Daten und Feedback pro Schritt", "Ein Blick zeigt, was erledigt ist, was bereit ist – und was der Kunde geantwortet hat.");
    shot(s, "mau-cj-steps.png", { x: 0.6, y: 2.15, w: 8.3, h: 4.75 }, { caption: "Schritte eines Kunden: Status, Datenprüfung, Inhalt, Feedback-Optionen, Feedback" });
    const st = [["Vorschlag", "EEF0F4", MUTED], ["Bereit zur Ausführung", "E3F4F7", ACCENT], ["Ausgesetzt", "FFF4DB", "8A5A00"], ["Erledigt", "E6F4EA", "2B8A3E"], ["Übersprungen", "EEF0F4", MUTED]];
    s.addText("STATUS", { x: 9.3, y: 2.25, w: 3.4, h: 0.3, fontSize: 10, bold: true, color: MUTED, charSpacing: 2, margin: 0, isTextBox: true, objectName: "status label" });
    st.forEach(([t, fill, color], i) => badge(s, t, { x: 9.3, y: 2.65 + i * 0.45, w: 2.4, fill, color, size: 11 }));
    await features(s, [
      ["alert", "«Daten prüfen» markiert Schritte mit fehlenden Daten als «Datenfehler»"],
      ["star", "Feedback mit Kommentar und 1–5 Sternen; «Kein Feedback» auf einen Blick"],
    ], { x: 9.3, y: 5.15, w: 3.45, rowH: 0.85, size: 13 });
    s.addNotes("«Erledigt» bereitet den Inhalt für den Kunden auf und speichert ihn – so ist nachvollziehbar, was der Kunde bekommen hat.");
  }
  {
    const s = content("KundenJourneys", "04 · KundenJourneys", "Ausführen – mit einem Klick, nach Bestätigung", "Alle Schritte «Bereit zur Ausführung» gehen an das System ihrer Aktion: Druckerei, Kundencenter, E-Mail-Versand.");
    shot(s, "mau-execute.png", { x: 0.6, y: 2.2, w: 6.0, h: 3.4 }, { caption: "Bestätigung: wie viele Schritte an welche Aktion gehen" });
    const flow = [["Bereit", "E3F4F7", ACCENT], ["Senden", "FDECEC", RED], ["Aktion", "EEF0F4", INK], ["Erledigt", "E6F4EA", "2B8A3E"]];
    flow.forEach(([t, fill, color], i) => {
      badge(s, t, { x: 0.6 + i * 1.55, y: 6.15, w: 1.35, fill, color, size: 10.5 });
      if (i < flow.length - 1) s.addText("→", { x: 0.6 + i * 1.55 + 1.33, y: 6.13, w: 0.24, h: 0.34, fontSize: 13, color: MUTED, align: "center", margin: 0, isTextBox: true, objectName: `exec arrow ${i}` });
    });
    await card(s, { x: 7.1, y: 2.25, w: 5.65, h: 1.4, ic: "send", compact: true, title: "Inhalt fertig aufbereitet", text: "Pro Schritt ein JSON mit Kunde, Inhalt, Feedback-Optionen und der Rückmelde-Adresse." });
    await card(s, { x: 7.1, y: 3.85, w: 5.65, h: 1.4, ic: "shield", compact: true, title: "Nichts Halbfertiges", text: "Fehlen Daten, bleibt der Schritt zurück – kein Brief mit leeren Platzhaltern." });
    await card(s, { x: 7.1, y: 5.45, w: 5.65, h: 1.4, ic: "checklist", compact: true, title: "Ergebnis pro Schritt", text: "Erfolg → «Erledigt»; Fehler werden beim Schritt vermerkt und können erneut gesendet werden." });
    s.addNotes("Der rote Knopf ist bewusst rot: Er wirkt nach aussen. Deshalb zeigt der Dialog zuerst, was passieren wird – erst «Senden» schickt ab.");
  }
  {
    const s = content("KundenJourneys", "04 · KundenJourneys", "Das Feedback kommt zurück – automatisch", "Das ausführende System meldet die Antwort des Kunden mit dem API-Schlüssel seiner Aktion.");
    shot(s, "mau-api.png", { x: 0.6, y: 2.15, w: 6.3, h: 4.75 }, { caption: "«API» pro Schritt: Aufruf der Aktion und Feedback setzen, zum Kopieren" });
    shot(s, "mau-actions.png", { x: 7.25, y: 2.15, w: 5.5, h: 2.3 }, { caption: "Administration → Aktionen: API-Schlüssel pro Aktion" });
    await features(s, [
      ["key", "Schlüssel pro Aktion, nur einmal angezeigt, nur als Hash gespeichert"],
      ["shield", "Gilt nur für Schritte der eigenen Aktion – sonst nichts"],
      ["refresh", "Neu erzeugen oder widerrufen mit einem Klick"],
    ], { x: 7.25, y: 4.95, w: 5.5, rowH: 0.62, size: 13.5 });
    s.addNotes("Damit schliesst sich der Kreis: Selektion, Journey, Ausführen – und die Antwort des Kunden landet beim richtigen Schritt.");
  }

  // ======== Vertrauen ========
  pres.addSection({ title: "Vertrauen" });
  {
    const s = content("Vertrauen", "Anmeldung und Rollen", "Eigene Anmeldung oder Single Sign-on", "Die Administration wählt: E-Mail und Passwort direkt in nexusMAUT – oder nexusIdentity für alle nexus-Apps.");
    shot(s, "mau-auth.png", { x: 0.6, y: 2.15, w: 6.6, h: 2.6 }, { caption: "Administration → Anmeldung: ein Schalter" });
    await card(s, { x: 7.6, y: 2.25, w: 5.15, h: 1.4, ic: "lock", compact: true, title: "Eigene Anmeldung", text: "Passwörter als scrypt-Hash, «Passwort vergessen» per E-Mail, Schutz vor Passwort-Raten." });
    await card(s, { x: 7.6, y: 3.85, w: 5.15, h: 1.4, ic: "key", compact: true, title: "nexusIdentity", text: "OpenID Connect mit PKCE – ein Konto für alle nexus-Anwendungen." });
    await card(s, { x: 7.6, y: 5.45, w: 5.15, h: 1.4, ic: "users", compact: true, title: "Rollen in nexusMAUT", text: "Redaktion arbeitet mit Kunden und Journeys, Admins richten das Modell ein." });
    await card(s, { x: 0.6, y: 5.45, w: 6.6, h: 1.4, ic: "shield", compact: true, title: "Schutz vor Aussperren", text: "Umschalten nur mit eigenem Passwort bzw. konfiguriertem nexusIdentity." });
    s.addNotes("Neue Konten warten, bis ein Admin ihnen eine Rolle gibt. Die erste Person, die sich anmeldet, wird Admin.");
  }
  {
    const s = content("Vertrauen", "Sicherheit", "Kundendaten in sicheren Händen", "Daten in Frankfurt, Rechte auf dem Server, nur das Nötige gespeichert.");
    const sec = [
      ["shield", "Daten in Frankfurt (EU)", "Anwendung bei Vercel und Datenbank bei MongoDB Atlas – beide in Frankfurt."],
      ["lock", "Verschlüsselt", "Nur HTTPS. Passwörter, Sitzungen und API-Schlüssel nur als Hash, SMTP-Passwort mit AES-256."],
      ["users", "Rechte auf dem Server", "Jede Anfrage wird gegen die Rolle geprüft – ein ausgeblendeter Knopf ist nie der einzige Schutz."],
      ["eye", "Kein Tracking", "Keine Analyse- oder Werbe-Cookies – nur das Anmelde-Cookie."],
      ["server", "Aufrufe auf dem Server", "Services und Aktionen ruft der Server auf; die Adressen legen nur Admins fest."],
      ["checklist", "Impressum und Datenschutz", "Transparent auf der Website: welche Daten, welche Anbieter, welche Rechte."],
    ];
    for (const [i, [ic, t, d]] of sec.entries()) await card(s, { x: 0.6 + (i % 3) * 4.1, y: 2.3 + Math.floor(i / 3) * 2.3, w: 3.9, h: 2.1, ic, title: t, text: d });
    s.addNotes("Details stehen in der Datenschutzerklärung unter /impressum#datenschutz.");
  }
  {
    const s = content("Vertrauen", "Technologie", "Mit KI entwickelt, auf modernem Fundament", "nexusMAUT entstand vollständig mit Claude Code – von Anforderungen in Alltagssprache bis zu getesteten Funktionen.");
    const cols = [
      ["route", "Entwicklung", ["Anforderungen auf Deutsch", "Funktionen in Stunden statt Wochen", "Dokumentiert für die nächste Änderung (CLAUDE.md)"]],
      ["layers", "Frontend", ["Next.js 16 · App Router", "React 19 · TypeScript", "CSS ohne UI-Bibliothek"]],
      ["server", "Backend & Daten", ["Next.js Route Handlers", "MongoDB · Zod", "OpenID Connect (jose)", "Nodemailer für E-Mails"]],
      ["shield", "Betrieb", ["Vercel, Frankfurt", "MongoDB Atlas, Frankfurt", "Deployment bei jedem Push"]],
    ];
    for (const [i, [ic, t, items]] of cols.entries()) {
      const x = 0.6 + i * 3.08;
      const dark = i === 0;
      s.addShape("rect", { x, y: 2.3, w: 2.9, h: 4.4, fill: { color: dark ? NAVY : LIGHT }, line: { color: dark ? NAVY : LIGHT, width: 0 }, objectName: `stack col ${t}` });
      s.addImage({ data: await icon(ic, dark ? { bg: "FFFFFF", color: NAVY } : {}), x: x + 0.25, y: 2.55, w: 0.48, h: 0.48, altText: "", objectName: `stack icon ${t}` });
      s.addText(t, { x: x + 0.25, y: 3.2, w: 2.4, h: 0.4, fontSize: 16, bold: true, color: dark ? "FFFFFF" : INK, margin: 0, isTextBox: true, objectName: `stack title ${t}` });
      s.addText(items.map((it, j) => ({ text: it, options: { breakLine: j < items.length - 1 } })), { x: x + 0.25, y: 3.75, w: 2.45, h: 2.7, fontSize: 13, color: dark ? "D5D8E3" : "3A4054", valign: "top", paraSpaceAfter: 12, margin: 0, isTextBox: true, objectName: `stack items ${t}` });
    }
    s.addNotes("Verbreitete Standardtechnologie; die KI-gestützte Entwicklung macht Änderungen schnell und hält die Dokumentation aktuell.");
  }

  // ======== Abschluss ========
  pres.addSection({ title: "Abschluss" });
  {
    const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Abschluss" });
    s.addText("NEXUSMAUT", { placeholder: "eyebrow" });
    s.addText("Bereit für Ihre erste Journey?", { placeholder: "title" });
    s.addText("nexus-maut.vercel.app – anmelden, Zielgruppe finden, Kunden begleiten.", { placeholder: "body" });
    s.addText("Entwickelt mit Claude Code · dokumentiert im Code · Daten in Frankfurt (EU)", { x: 0.7, y: 6.55, w: 9, h: 0.35, fontSize: 13, color: "9AA0B8", margin: 0, isTextBox: true, objectName: "closing line" });
    s.addImage({ data: await icon("route", { bg: ACCENT, color: "FFFFFF" }), x: 9.6, y: 2.3, w: 2.4, h: 2.4, altText: "nexusMAUT", objectName: "closing logo" });
    s.addNotes("Nächster Schritt: Konto erstellen, Beispieldaten anschauen und die erste Selektion anlegen.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log(`written ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
