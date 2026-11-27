import type { ContentFormat } from "@/lib/contentFormats";
import type { IdRef, UpdateFrequency } from "@/lib/events";
import type { JourneyType } from "@/lib/journeyTypes";
import type { MappedValue } from "@/lib/serviceCall";
import type { UploadSource } from "@/lib/uploads";
import type { StepStatus } from "@/lib/stepStatus";
import type { FeedbackMeaning } from "@/lib/feedbackOptions";
// Shapes the server hands to client components (JSON-safe).

import type { Condition } from "./rules";
import type { ListSpec } from "./serviceCall";

export type Me = { id: string; email: string; name: string; role: "admin" | "editor" | "pending" };

export type Customer = {
  id: string;
  /** «ID» (own key, unique), "" = none */
  externalId: string;
  name: string;
  lastname: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** customer attribute id → value */
  attributes: Record<string, string | number | boolean>;
  serviceFetched?: ServiceFetchedView;
  /** number of positions (customer list only) */
  positionCount?: number;
  /** set by an upload (Admin → Data Management); null = entered by hand */
  uploadSource: UploadSource | null;
  /** the upload's unique name */
  uploadName: string | null;
  uploadDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainValue = {
  id: string;
  domain: "productServiceType" | "comPrefs" | "serviceType";
  code: string;
  label: string;
  active: boolean;
  sort: number;
  /** records that use this value (admin view only) */
  usage?: number;
  /** number of position / transaction attributes (productServiceType, admin view only) */
  attributeCounts?: { position: number; trx: number };
};

/** An attribute definition: of a product type (typeId) or of customers (no typeId). */
export type TypeAttribute = {
  id: string;
  typeId?: string;
  attribute: string;
  attributeType: "alpha" | "num" | "date" | "bool" | "list";
  options: string[];
  sort: number;
  /** service GET attributes only: a list (table) with columns */
  list?: ListSpec | null;
  /** customer / position / trx attributes: value from a service's GET attribute */
  service?: { serviceId: string; attrId: string } | null;
};

/** When a service attribute value was last fetched (attribute id → …). */
/** `mock`: the value is a random value of a «Mock» service */
export type ServiceFetchedView = Record<string, { at: string; error: string | null; mock: boolean }>;

export type CustomerProduct = {
  id: string;
  customerId: string;
  name: string;
  productServiceType: string;
  updatedAt: string;
};

export type PositionTransaction = {
  id: string;
  /** «ID» (own key, unique), "" = none */
  externalId: string;
  positionId: string;
  /** trx attribute id → value (string | number | boolean) */
  values: Record<string, string | number | boolean>;
  serviceFetched?: ServiceFetchedView;
  /** set by an upload (Admin → Data Management); null = entered by hand */
  uploadSource: UploadSource | null;
  /** the upload's unique name */
  uploadName: string | null;
  uploadDate: string | null;
  sort: number;
  updatedAt: string;
};

export type CustomerPosition = {
  id: string;
  /** «ID» (own key, unique), "" = none */
  externalId: string;
  customerId: string;
  /** number of transactions (lists) */
  transactionCount?: number;
  /** code of domain productServiceType */
  productServiceType: string;
  /** attribute id → value (string | number | boolean) */
  values: Record<string, string | number | boolean>;
  serviceFetched?: ServiceFetchedView;
  /** set by an upload (Admin → Data Management); null = entered by hand */
  uploadSource: UploadSource | null;
  /** the upload's unique name */
  uploadName: string | null;
  uploadDate: string | null;
  sort: number;
  updatedAt: string;
};

export type CustomerComPref = {
  id: string;
  customerId: string;
  usageInstruction: string;
  comPrefType: string;
  updatedAt: string;
};

/** E-mail settings for Admin – the password itself never leaves the server. */
/** Admin → Anmeldung */
export type AuthSettingsView = {
  mode: "nexusIdentity" | "local";
  allowRegistration: boolean;
  /** admin = saved in Admin, env = AUTH_MODE / default */
  source: "admin" | "env";
  /** NEXUS_CLIENT_ID + NEXUS_CLIENT_SECRET set */
  oidcConfigured: boolean;
  updatedAt: string | null;
};

/** A row of Admin → Benutzer */
export type UserRow = Me & { lastLoginAt: string; hasPassword: boolean; nexusIdentity: boolean };

export type MailSettingsView = {
  /** admin = saved in Admin, env = from .env / hosting, none = not configured (dev: console) */
  source: "admin" | "env" | "none";
  host: string;
  port: number;
  user: string;
  from: string;
  replyTo: string;
  passwordSet: boolean;
  updatedAt: string | null;
};

export type JourneyView = {
  id: string;
  name: string;
  description: string;
  journeyType: JourneyType;
  updatedAt: string;
  /** number of steps */
  stepCount: number;
};

export type FeedbackOptionView = {
  id: string;
  stepId: string;
  option: string;
  meaning: FeedbackMeaning;
  sort: number;
};

export type JourneyStepView = {
  id: string;
  journeyId: string;
  actionId: string;
  /** free text (multi-line) */
  content: string;
  sort: number;
  updatedAt: string;
  /** relation journeyStepFeedbackOptions, in order */
  feedbackOptions: FeedbackOptionView[];
};

export type ServiceView = {
  id: string;
  name: string;
  /** code of domain serviceType */
  serviceType: string;
  /** http(s) address or "" */
  url: string;
  /** «Mock»: random values instead of calling the service */
  mock: boolean;
  updatedAt: string;
  /** number of PUT / GET attributes */
  attributeCounts: { put: number; get: number };
};

export type CustomerJourneyStatus = "active" | "done" | "cancelled";
export type CustomerJourneyStepStatus = StepStatus;

/** A journey for one customer (list row). */
export type CustomerJourneyView = {
  id: string;
  customerId: string;
  customerName: string;
  journeyId: string;
  journeyName: string;
  status: CustomerJourneyStatus;
  source: { kind: "manual" } | { kind: "rule"; ruleId: string; ruleName: string } | { kind: "event"; eventId: string; eventName: string };
  startedAt: string;
  completedAt: string | null;
  progress: { done: number; skipped: number; total: number };
  /** steps with dataStatus «error» */
  dataErrors: number;
};

export type DataStatus = "unchecked" | "ok" | "error";

export type CustomerFeedbackView = {
  id: string;
  feedback: string;
  feedbackComment: string;
  feedbackRating: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerJourneyStepView = {
  id: string;
  stepId: string;
  actionId: string;
  actionName: string;
  /** the action's content format – how `content` is shown */
  contentFormat: ContentFormat;
  template: string;
  sort: number;
  status: CustomerJourneyStepStatus;
  content: string | null;
  unfilled: string[];
  doneAt: string | null;
  note: string;
  dataStatus: DataStatus;
  dataProblems: string[];
  dataCheckedAt: string | null;
  feedbacks: CustomerFeedbackView[];
  /** the template step's feedback options (current, in order) */
  feedbackOptions: FeedbackOptionView[];
  /** last «Ausführen» */
  execution: { at: string; ok: boolean; url: string; httpStatus: number | null; error: string | null } | null;
};

/** «Ausführen»: what would be sent */
export type ExecutionPreview = {
  /** steps «Bereit zur Ausführung» in active KundenJourneys of the journey */
  total: number;
  /** will be sent (action with URL) */
  sendable: number;
  byAction: { actionId: string; name: string; url: string; count: number }[];
  /** of the sendable ones: last data check found a problem (checked again when sending) */
  knownDataErrors: number;
};

export type ExecutionResult = {
  sent: number;
  failed: number;
  dataErrors: number;
  withoutUrl: number;
  /** not processed in this round (time budget) – press «Ausführen» again */
  remaining: number;
  errors: string[];
};

export type TextBlockView = {
  id: string;
  code: string;
  label: string;
  category: string;
  content: string;
  /** journey steps whose content refers to it */
  usedInSteps: number;
  /** open KundenJourney steps (copied templates) that refer to it */
  usedInRuns: number;
  updatedAt: string;
};

export type EventView = {
  id: string;
  name: string;
  description: string;
  serviceId: string;
  /** null when the service is gone */
  serviceName: string | null;
  /** false when the service isn't a trigger service (any more) */
  serviceIsTrigger: boolean;
  updateFrequency: UpdateFrequency;
  /** what the IDs in the service's answer refer to */
  idRef: IdRef;
  /** null on events from before the field existed */
  journeyId: string | null;
  /** null when there is none or it is gone */
  journeyName: string | null;
  /** latest call of the trigger service, null = never called */
  lastCall: EventCallView | null;
  /** latest «Journeys starten», null = never */
  lastStart: { at: string; byName: string; numbers: number; created: number; skipped: number; unknown: string[] } | null;
  updatedAt: string;
};

export type EventCallView = {
  at: string;
  /** who pressed «Service jetzt aufrufen» */
  byName: string;
  serviceName: string;
  url: string;
  ok: boolean;
  mock: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  error: string | null;
  values: MappedValue[] | null;
  raw: string | null;
};

export type ActionView = {
  id: string;
  name: string;
  description: string;
  /** http(s) address or "" */
  url: string;
  /** how its step contents are written and sent */
  contentFormat: ContentFormat;
  /** character limit of a rendered content, null = none */
  maxChars: number | null;
  updatedAt: string;
  /** number of action attributes */
  attributeCount: number;
  /** API key for the feedback API – never the key itself */
  apiKey: { hint: string; createdAt: string; lastUsedAt: string | null } | null;
};

export type RuleView = {
  id: string;
  name: string;
  description: string;
  match: "all" | "any";
  conditions: Condition[];
  updatedAt: string;
  /** number of matching customers (lists) */
  matchCount?: number;
};

/** Admin → Data Management → Initial Upload: what a source contains and what an upload would do. */
export type UploadReport = {
  source: UploadSource;
  files: string[];
  counts: { customers: number; positions: number; transactions: number; products: number };
  /** «Privatkonto (konto)» */
  newTypes: string[];
  /** «Privatkonto · Position: Saldo (Zahl)» */
  newAttributes: string[];
  newCustomerAttributes: string[];
  /** what the upload deletes first (0 when the switch is off) */
  deletes: { customers: number; positions: number; transactions: number; customerJourneys: number; attributes: number };
  /** «Upload Daten löschen»: the selected uploads and what of their data is deleted first */
  uploadDeletes: { names: string[]; customers: number; positions: number; transactions: number; customerJourneys: number } | null;
  /** customers already there (kept when «Bestehende Kunden löschen» is off) */
  existingCustomers: number;
  /** the first 100 */
  errors: string[];
  errorCount: number;
  warnings: string[];
};

export type UploadResult = UploadReport & {
  /** false: test only, or not uploaded because of errors */
  done: boolean;
  /** the upload's unique name (when uploaded) */
  sourceName: string | null;
  created: { customers: number; positions: number; transactions: number; products: number; types: number; attributes: number } | null;
};

/** Admin → Data Management: an earlier upload, with what of its data is still there */
export type UploadView = {
  id: string;
  name: string;
  source: UploadSource;
  files: string[];
  createdAt: string;
  createdByName: string;
  /** as uploaded */
  counts: { customers: number; positions: number; transactions: number; products: number } | null;
  /** records still carrying its name */
  current: { customers: number; positions: number; transactions: number };
  deletedAt: string | null;
};
