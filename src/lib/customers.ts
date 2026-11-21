// Customers: birth date helpers shared by server (validation) and page.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Problem with a birth date "YYYY-MM-DD" (a real day, 1900 … today), or null if it's fine. */
export function dateOfBirthError(value: string, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!DAY.test(value)) return "Geburtsdatum als JJJJ-MM-TT";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return "Ungültiges Geburtsdatum";
  if (value < "1900-01-01") return "Geburtsdatum vor 1900";
  if (value > today) return "Geburtsdatum liegt in der Zukunft";
  return null;
}

/** Stored as UTC midnight of the calendar day. */
export const dayToDb = (value: string) => new Date(`${value}T00:00:00Z`);
export const dayFromDb = (d: Date) => d.toISOString().slice(0, 10);

/** "1990-04-01" → "01.04.1990" */
export const formatDay = (value: string) => value.split("-").reverse().join(".");
