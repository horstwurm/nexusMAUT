// Shapes the server hands to client components (JSON-safe).

import type { Condition } from "./rules";
import type { ListSpec } from "./serviceCall";

export type Me = { id: string; email: string; name: string; role: "admin" | "editor" | "pending" };

export type Customer = {
  id: string;
  name: string;
  lastname: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** customer attribute id → value */
  attributes: Record<string, string | number | boolean>;
  /** number of positions (customer list only) */
  positionCount?: number;
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
};

export type CustomerProduct = {
  id: string;
  customerId: string;
  name: string;
  productServiceType: string;
  updatedAt: string;
};

export type PositionTransaction = {
  id: string;
  positionId: string;
  /** trx attribute id → value (string | number | boolean) */
  values: Record<string, string | number | boolean>;
  sort: number;
  updatedAt: string;
};

export type CustomerPosition = {
  id: string;
  customerId: string;
  /** number of transactions (lists) */
  transactionCount?: number;
  /** code of domain productServiceType */
  productServiceType: string;
  /** attribute id → value (string | number | boolean) */
  values: Record<string, string | number | boolean>;
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
  updatedAt: string;
  /** number of steps */
  stepCount: number;
};

export type JourneyStepView = {
  id: string;
  journeyId: string;
  actionId: string;
  /** free text (multi-line) */
  content: string;
  sort: number;
  updatedAt: string;
};

export type ServiceView = {
  id: string;
  name: string;
  /** code of domain serviceType */
  serviceType: string;
  /** http(s) address or "" */
  url: string;
  updatedAt: string;
  /** number of PUT / GET attributes */
  attributeCounts: { put: number; get: number };
};

export type CustomerJourneyStatus = "active" | "done" | "cancelled";
export type CustomerJourneyStepStatus = "open" | "done" | "skipped";

/** A journey for one customer (list row). */
export type CustomerJourneyView = {
  id: string;
  customerId: string;
  customerName: string;
  journeyId: string;
  journeyName: string;
  status: CustomerJourneyStatus;
  source: { kind: "manual" } | { kind: "rule"; ruleId: string; ruleName: string };
  startedAt: string;
  completedAt: string | null;
  progress: { done: number; skipped: number; total: number };
};

export type CustomerJourneyStepView = {
  id: string;
  stepId: string;
  actionId: string;
  actionName: string;
  template: string;
  sort: number;
  status: CustomerJourneyStepStatus;
  content: string | null;
  unfilled: string[];
  doneAt: string | null;
  note: string;
};

export type ActionView = {
  id: string;
  name: string;
  description: string;
  /** http(s) address or "" */
  url: string;
  updatedAt: string;
  /** number of action attributes */
  attributeCount: number;
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
