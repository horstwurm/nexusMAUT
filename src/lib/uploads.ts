// Data Management uploads (Admin → Data Management): the source formats.

export const UPLOAD_SOURCES = ["csv", "excel", "json"] as const;
export type UploadSource = (typeof UPLOAD_SOURCES)[number];

/** Source name of records entered by hand (customer / position / transaction forms) – reserved, no upload may use it. */
export const MANUAL_SOURCE_NAME = "Manuell";

export const UPLOAD_SOURCE_LABELS: Record<UploadSource, string> = { csv: "CSV", excel: "Excel", json: "JSON" };

/** A suggestion for an upload's unique name: «Upload 2026-11-24 K7QX» (random suffix, no 0/O/1/I). */
export function randomSourceName(now = new Date()) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `Upload ${now.toISOString().slice(0, 10)} ${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}
