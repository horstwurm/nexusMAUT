// Logfile (Admin → Logfile): action labels and the entry view – shared by server and page.

export const LOG_ACTIONS = {
  created: "Angelegt",
  updated: "Geändert",
  deleted: "Gelöscht",
  assigned: "Zugewiesen",
  executed: "Ausgeführt",
  checked: "Daten geprüft",
  refreshed: "Service-Werte aktualisiert",
  called: "Service aufgerufen",
  started: "Journeys gestartet",
  keyCreated: "API-Schlüssel erzeugt",
  keyRevoked: "API-Schlüssel widerrufen",
  uploaded: "Hochgeladen",
  passwordChanged: "Passwort geändert",
} as const;
export type LogAction = keyof typeof LOG_ACTIONS;

export type LogEntryView = {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  area: string;
  entityId: string;
  entityName: string;
  action: string;
  changes: { field: string; from: string; to: string }[];
  note: string;
  link: string | null;
};

export type LogList = { entries: LogEntryView[]; more: boolean; options: { areas: string[]; users: { id: string; name: string }[] } };
