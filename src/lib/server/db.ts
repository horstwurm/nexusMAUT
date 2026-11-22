import "server-only";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { DomainName } from "@/lib/domains";
import type { PositionValues } from "@/lib/positions";
import type { Condition } from "@/lib/rules";
import type { ListSpec } from "@/lib/serviceCall";
import type { AttributeType } from "@/lib/typeAttributes";

// All document types. No migrations: collections appear on first write,
// indexes are created on first connect.

export type Role = "admin" | "editor" | "pending";

/**
 * A person with access to nexusMAUT. Logged in via nexusIdentity: `_id` = the
 * `sub` claim (the stable user key there). Registered here (own login):
 * `_id` = "local_…"; linked to nexusIdentity later via `oidcSub`. Roles live
 * here, not in nexusIdentity.
 */
export type UserDoc = {
  _id: string;
  email: string;
  name: string;
  /** pending = logged in, waiting for an admin to give access */
  role: Role;
  /** own login (passwords.ts: scrypt) – set by registration, «Mein Konto» or a reset link */
  passwordHash?: string;
  passwordChangedAt?: Date;
  /** nexusIdentity `sub` of a user registered here (linked by verified e-mail) */
  oidcSub?: string;
  createdAt: Date;
  lastLoginAt: Date;
};

/** Our own login session (cookie `sid`, only its sha256 stored). */
export type SessionDoc = {
  _id: string;
  userId: string;
  /** For `id_token_hint` at single sign-out; none after a password login */
  idToken?: string;
  expiresAt: Date;
};

export type AuthMode = "nexusIdentity" | "local";

/** How people log in (Admin → Anmeldung; `settings` doc `_id: "auth"`). */
export type AuthSettingsDoc = {
  _id: "auth";
  mode: AuthMode;
  /** own login: anyone may create an account (it waits for a role) */
  allowRegistration: boolean;
  updatedAt: Date;
  updatedBy: string;
};

/** An open «Passwort vergessen» link (sha256 of the token, single use, 60 min). */
export type PasswordResetDoc = {
  _id: string;
  userId: string;
  expiresAt: Date;
};

/** A failed password login (throttling; removed after 15 min). */
export type LoginFailureDoc = {
  _id: ObjectId;
  email: string;
  at: Date;
};

/** Running login at nexusIdentity (state → this, 10 min). */
export type LoginStateDoc = {
  _id: string; // state
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: Date;
};

/** A customer: a person with name and birth date, independent of contacts. */
export type CustomerDoc = {
  _id: ObjectId;
  name: string;
  lastname: string;
  /** Calendar day as UTC midnight */
  dateOfBirth: Date;
  /** values of the customer attributes (`customerAttributes._id` → value); missing = none set */
  attributes?: PositionValues;
  serviceFetched?: ServiceFetched;
  createdAt: Date;
  updatedAt: Date;
};

/** An attribute every customer can have (relation customerAttributes, managed in Admin). */
export type CustomerAttributeDoc = Omit<TypeAttributeDoc, "typeId">;

/**
 * A value of an admin-managed list ("domain"), e.g. a product/service type.
 * `code` is what records store – fixed after creation; `label` may change.
 * Inactive values can't be chosen any more but stay valid where used.
 */
export type DomainValueDoc = {
  _id: ObjectId;
  domain: DomainName;
  code: string;
  label: string;
  active: boolean;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * An attribute of a product/service type (relation domain value of
 * `productServiceType` 1:n) – two relations with this shape:
 * productServiceTypePositionAttributes (values in `customerPositions`) and
 * productServiceTypeTrxAttributes (values in `positionTransactions`). `options` only for attributeType "list".
 */
/** Where a «Service» attribute's value comes from: a simple GET attribute of a service. */
export type ServiceSource = { serviceId: ObjectId; attrId: ObjectId };

/** When / how a service attribute value was last fetched (per attribute id, on the record). */
/** `mock`: the stored value is a random value of a «Mock» service, not a real answer */
export type ServiceFetched = Record<string, { at: Date; error: string | null; mock?: boolean }>;

export type TypeAttributeDoc = {
  _id: ObjectId;
  /** `domainValues._id` of the productServiceType value */
  typeId: ObjectId;
  attribute: string;
  /** for a service attribute: the GET attribute's type (copied, kept in sync) */
  attributeType: AttributeType;
  options: string[];
  /** customer / position / trx attributes: value fetched from a service (read-only in forms) */
  service?: ServiceSource | null;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A product or service a customer has (relation customer 1:n). */
export type CustomerProductDoc = {
  _id: ObjectId;
  customerId: ObjectId;
  name: string;
  /** code of domain `productServiceType` */
  productServiceType: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A position of a customer (relation customer 1:n): a product/service type
 * and values of that type's position attributes, keyed by attribute id
 * (`productServiceTypePositionAttributes._id`, so renaming an attribute keeps them).
 */
export type CustomerPositionDoc = {
  _id: ObjectId;
  customerId: ObjectId;
  /** code of domain `productServiceType` */
  productServiceType: string;
  values: PositionValues;
  serviceFetched?: ServiceFetched;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A transaction of a customer position (relation customerPositions 1:n):
 * values of the position type's transaction attributes
 * (`productServiceTypeTrxAttributes._id` → value).
 */
export type PositionTransactionDoc = {
  _id: ObjectId;
  positionId: ObjectId;
  /** denormalised for deleting with the customer */
  customerId: ObjectId;
  values: PositionValues;
  serviceFetched?: ServiceFetched;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

/** How a customer wants to be contacted (relation customer 1:n). */
export type CustomerComPrefDoc = {
  _id: ObjectId;
  customerId: ObjectId;
  usageInstruction: string;
  /** code of domain `comPrefs` */
  comPrefType: string;
  createdAt: Date;
  updatedAt: Date;
};

/** E-mail settings from Admin (single doc `_id: "mail"`); override the NODE_MAILER_* env vars. */
export type MailSettingsDoc = {
  _id: "mail";
  host: string;
  port: number;
  user: string;
  /** encrypted (crypto.ts `encrypt`); never sent to the page */
  passwordEnc: string;
  from: string;
  replyTo: string;
  updatedAt: Date;
  updatedBy: string;
};

/** A journey – managed in Admin; name unique (case-insensitive). */
export type JourneyDoc = {
  _id: ObjectId;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

/** A step of a journey (relation journeySteps, journey 1:n, ordered). */
export type JourneyStepDoc = {
  _id: ObjectId;
  journeyId: ObjectId;
  /** `actions._id` */
  actionId: ObjectId;
  /** free text (multi-line) */
  content: string;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A service: name (unique, case-insensitive), type (code of domain `serviceType`), url. */
export type ServiceDoc = {
  _id: ObjectId;
  name: string;
  serviceType: string;
  /** http(s) address; "" = none (missing on services created before 2026-11-21) */
  url?: string;
  /** «Mock»: the service isn't called – random values instead (missing = off) */
  mock?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * An attribute of a service – two relations with this shape: putAttributes
 * (`servicePutAttributes`) and getAttributes (`serviceGetAttributes`).
 */
export type ServiceAttributeDoc = Omit<TypeAttributeDoc, "typeId"> & {
  serviceId: ObjectId;
  /** GET attributes only: a list (table) with own columns; then attributeType is unused ("alpha") */
  list?: ListSpec | null;
};

/**
 * A journey for one customer (KundenJourney): the customer runs through the
 * journey's steps. One active run per customer and journey.
 */
export type CustomerJourneyDoc = {
  _id: ObjectId;
  customerId: ObjectId;
  journeyId: ObjectId;
  status: "active" | "done" | "cancelled";
  /** assigned individually, or via a Kunden Selektion (rule) */
  source: { kind: "manual" } | { kind: "rule"; ruleId: ObjectId; ruleName: string };
  startedAt: Date;
  completedAt: Date | null;
  createdBy: string;
  updatedAt: Date;
};

/**
 * A customer's progress on one step – a copy of the template step made at
 * assignment (later template edits don't change running journeys). `content`
 * is the step rendered for the customer when it was marked done.
 */
export type CustomerJourneyStepDoc = {
  _id: ObjectId;
  customerJourneyId: ObjectId;
  customerId: ObjectId;
  /** the template step (may be deleted since) */
  stepId: ObjectId;
  actionId: ObjectId;
  /** the template content at assignment */
  template: string;
  sort: number;
  status: "open" | "done" | "skipped";
  /** rendered for the customer when done (placeholders filled) */
  content: string | null;
  /** placeholders without a value at rendering */
  unfilled: string[];
  doneAt: Date | null;
  note: string;
  /**
   * Result of «Daten prüfen»: are the data the step needs there for the
   * customer? (missing on older docs = unchecked)
   */
  dataStatus?: "unchecked" | "ok" | "error";
  /** what is missing (placeholder: reason / service error) */
  dataProblems?: string[];
  dataCheckedAt?: Date | null;
  updatedAt: Date;
};

/** A customer's feedback on a step of a KundenJourney (relation customerFeedback). */
export type CustomerFeedbackDoc = {
  _id: ObjectId;
  customerJourneyStepId: ObjectId;
  customerJourneyId: ObjectId;
  customerId: ObjectId;
  feedback: string;
  feedbackComment: string;
  /** 1 … 5, null = no rating */
  feedbackRating: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** An action (Aktion) – managed in Admin; name unique (case-insensitive). */
export type ActionDoc = {
  _id: ObjectId;
  name: string;
  description: string;
  /** http(s) address; "" = none (missing on actions created before 2026-11-21) */
  url?: string;
  createdAt: Date;
  updatedAt: Date;
};

/** An attribute of an action (relation actionAttributes, action 1:n). Same shape as type attributes. */
export type ActionAttributeDoc = Omit<TypeAttributeDoc, "typeId"> & { actionId: ObjectId };

/** A rule (Regel): a customer segment by conditions on customer, positions and transactions. */
export type RuleDoc = {
  _id: ObjectId;
  name: string;
  description: string;
  /** all conditions must hold, or any of them */
  match: "all" | "any";
  conditions: Condition[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Collections renamed since: moved once when the old name exists and the new one is missing or empty. */
const RENAMED: [from: string, to: string][] = [
  ["productServiceTypeAttributes", "productServiceTypePositionAttributes"],
  // ["customerJourneys", "journeys"] ran in 2026-11 (model renamed customerJourney → journey);
  // removed again: `customerJourneys` now holds the journeys of customers.
];

async function renameOld(db: Db) {
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [from, to] of RENAMED) {
    if (!names.has(from)) continue;
    if (names.has(to)) {
      // the new name may already exist empty (indexes created by a dev server
      // that ran the new code first) – then it's replaced; otherwise leave both
      if ((await db.collection(to).estimatedDocumentCount()) > 0) {
        console.warn(`[db] both ${from} and ${to} hold data – not renamed, please merge by hand`);
        continue;
      }
      await db.collection(to).drop();
    }
    await db.renameCollection(from, to);
    console.log(`[db] renamed collection ${from} → ${to}`);
  }
}

/**
 * Positions moved from customer products to the customer (2026-11): each old
 * `productPositions` doc becomes a `customerPositions` doc with its product's
 * type (same _id, so a repeated run skips it), then the old collection goes.
 * Positions whose product no longer exists are dropped (they were orphans).
 */
async function movePositionsToCustomers(db: Db) {
  const names = new Set((await db.listCollections({ name: "productPositions" }, { nameOnly: true }).toArray()).map((c) => c.name));
  if (!names.has("productPositions")) return;
  const old = db.collection<{ _id: ObjectId; productId: ObjectId; customerId: ObjectId; values: PositionValues; sort: number; createdAt: Date; updatedAt: Date }>("productPositions");
  const products = db.collection<CustomerProductDoc>("customerProducts");
  const target = db.collection<CustomerPositionDoc>("customerPositions");
  let moved = 0;
  let orphans = 0;
  for await (const p of old.find()) {
    const product = await products.findOne({ _id: p.productId });
    if (!product) {
      orphans++;
      continue;
    }
    const doc: CustomerPositionDoc = {
      _id: p._id,
      customerId: p.customerId,
      productServiceType: product.productServiceType,
      values: p.values,
      sort: p.sort,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
    await target.updateOne({ _id: p._id }, { $setOnInsert: doc }, { upsert: true });
    moved++;
  }
  await old.drop().catch(() => false); // a parallel run may have dropped it already
  console.log(`[db] moved ${moved} positions from productPositions to customerPositions${orphans ? ` (${orphans} orphans dropped)` : ""}`);
}

/**
 * Until 2026-11 Kunden Selektionen had service conditions ({ level: "service",
 * serviceId, attrId, op, value }). Service values are now «Service» customer
 * attributes: each such condition becomes a condition on a customer attribute
 * fed by the same GET attribute (reused, or created with the GET attribute's
 * name). The values are fetched later (Admin «Werte aktualisieren» / saving).
 */
async function convertServiceConditions(db: Db) {
  const rules = db.collection<{ _id: ObjectId; conditions: Record<string, unknown>[] }>("rules");
  const list = await rules.find({ "conditions.level": "service" }).toArray();
  if (!list.length) return;
  const attrs = db.collection<CustomerAttributeDoc>("customerAttributes");
  const getAttrs = db.collection<ServiceAttributeDoc>("serviceGetAttributes");
  for (const rule of list) {
    const conditions = [];
    for (const cond of rule.conditions) {
      if (cond.level !== "service") {
        conditions.push(cond);
        continue;
      }
      const serviceId = ObjectId.isValid(String(cond.serviceId)) ? new ObjectId(String(cond.serviceId)) : null;
      const attrId = ObjectId.isValid(String(cond.attrId)) ? new ObjectId(String(cond.attrId)) : null;
      const getAttr = serviceId && attrId ? await getAttrs.findOne({ _id: attrId, serviceId }) : null;
      if (!getAttr || getAttr.list) continue; // deleted service / attribute: the condition matched nothing anyway
      let attr = await attrs.findOne({ "service.attrId": attrId });
      if (!attr) {
        const taken = await attrs.findOne({ attribute: getAttr.attribute }, { collation: { locale: "de", strength: 2 } });
        const last = await attrs.find().sort({ sort: -1 }).limit(1).next();
        const now = new Date();
        attr = {
          _id: new ObjectId(),
          attribute: taken ? `${getAttr.attribute} (Service)` : getAttr.attribute,
          attributeType: getAttr.attributeType,
          options: getAttr.options,
          service: { serviceId: serviceId!, attrId: attrId! },
          sort: last ? last.sort + 10 : 10,
          createdAt: now,
          updatedAt: now,
        };
        await attrs.insertOne(attr);
      }
      conditions.push({ level: "customer", field: "attribute", attrId: attr._id.toHexString(), op: cond.op, value: cond.value });
    }
    await rules.updateOne({ _id: rule._id }, { $set: { conditions, updatedAt: new Date() } });
    console.log(`[db] Kunden Selektion ${rule._id.toHexString()}: service conditions → «Service» customer attributes`);
  }
}

async function init(db: Db) {
  await renameOld(db);
  await movePositionsToCustomers(db);
  await convertServiceConditions(db);
  const c = collectionsOf(db);
  // an attribute name once per type, case-insensitive
  const attributeIndexes = (col: Collections["positionAttributes"]) => [
    col.createIndex(
      { typeId: 1, attribute: 1 },
      { unique: true, collation: { locale: "de", strength: 2 }, name: "type_attribute_unique" },
    ),
    col.createIndex({ typeId: 1, sort: 1 }),
  ];
  await Promise.all([
    ...attributeIndexes(c.positionAttributes),
    ...attributeIndexes(c.trxAttributes),
    c.users.createIndex({ email: 1 }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.sessions.createIndex({ userId: 1 }),
    c.loginStates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.users.createIndex({ oidcSub: 1 }, { sparse: true }),
    c.passwordResets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.passwordResets.createIndex({ userId: 1 }),
    c.loginFailures.createIndex({ at: 1 }, { expireAfterSeconds: 15 * 60 }),
    c.loginFailures.createIndex({ email: 1, at: 1 }),
    c.customers.createIndex({ lastname: 1, name: 1 }),
    // an attribute name once, case-insensitive
    c.customerAttributes.createIndex({ attribute: 1 }, { unique: true, collation: { locale: "de", strength: 2 }, name: "customer_attribute_unique" }),
    c.customerAttributes.createIndex({ sort: 1 }),
    c.domainValues.createIndex({ domain: 1, code: 1 }, { unique: true }),
    c.domainValues.createIndex({ domain: 1, sort: 1 }),
    c.customerProducts.createIndex({ customerId: 1, name: 1 }),
    c.customerProducts.createIndex({ productServiceType: 1 }),
    c.customerComPrefs.createIndex({ customerId: 1 }),
    c.customerPositions.createIndex({ customerId: 1, sort: 1 }),
    c.customerPositions.createIndex({ productServiceType: 1 }),
    c.positionTransactions.createIndex({ positionId: 1, sort: 1 }),
    c.positionTransactions.createIndex({ customerId: 1 }),
    c.customerComPrefs.createIndex({ comPrefType: 1 }),
    c.rules.createIndex({ name: 1 }),
    c.actions.createIndex({ name: 1 }, { unique: true, collation: { locale: "de", strength: 2 }, name: "action_name_unique" }),
    // an attribute name once per action, case-insensitive
    c.actionAttributes.createIndex(
      { actionId: 1, attribute: 1 },
      { unique: true, collation: { locale: "de", strength: 2 }, name: "action_attribute_unique" },
    ),
    c.actionAttributes.createIndex({ actionId: 1, sort: 1 }),
    c.journeys.createIndex({ name: 1 }, { unique: true, collation: { locale: "de", strength: 2 }, name: "journey_name_unique" }),
    c.journeySteps.createIndex({ journeyId: 1, sort: 1 }),
    c.services.createIndex({ name: 1 }, { unique: true, collation: { locale: "de", strength: 2 }, name: "service_name_unique" }),
    c.services.createIndex({ serviceType: 1 }),
    ...[c.servicePutAttributes, c.serviceGetAttributes].flatMap((col) => [
      // an attribute name once per service and relation, case-insensitive
      col.createIndex({ serviceId: 1, attribute: 1 }, { unique: true, collation: { locale: "de", strength: 2 }, name: "service_attribute_unique" }),
      col.createIndex({ serviceId: 1, sort: 1 }),
    ]),
    c.journeySteps.createIndex({ actionId: 1 }),
    // one active run of a journey per customer
    c.customerJourneys.createIndex(
      { customerId: 1, journeyId: 1 },
      { unique: true, partialFilterExpression: { status: "active" }, name: "customer_journey_active_unique" },
    ),
    c.customerJourneys.createIndex({ journeyId: 1, status: 1 }),
    c.customerJourneys.createIndex({ startedAt: -1 }),
    c.customerJourneySteps.createIndex({ customerJourneyId: 1, sort: 1 }),
    c.customerJourneySteps.createIndex({ customerId: 1 }),
    c.customerFeedbacks.createIndex({ customerJourneyStepId: 1, createdAt: 1 }),
    c.customerFeedbacks.createIndex({ customerJourneyId: 1 }),
    c.customerFeedbacks.createIndex({ customerId: 1 }),
  ]);
}

function collectionsOf(db: Db) {
  return {
    users: db.collection<UserDoc>("users"),
    sessions: db.collection<SessionDoc>("sessions"),
    loginStates: db.collection<LoginStateDoc>("loginStates"),
    passwordResets: db.collection<PasswordResetDoc>("passwordResets"),
    loginFailures: db.collection<LoginFailureDoc>("loginFailures"),
    customers: db.collection<CustomerDoc>("customers"),
    customerAttributes: db.collection<CustomerAttributeDoc>("customerAttributes"),
    customerProducts: db.collection<CustomerProductDoc>("customerProducts"),
    customerComPrefs: db.collection<CustomerComPrefDoc>("customerComPrefs"),
    customerPositions: db.collection<CustomerPositionDoc>("customerPositions"),
    positionTransactions: db.collection<PositionTransactionDoc>("positionTransactions"),
    domainValues: db.collection<DomainValueDoc>("domainValues"),
    positionAttributes: db.collection<TypeAttributeDoc>("productServiceTypePositionAttributes"),
    trxAttributes: db.collection<TypeAttributeDoc>("productServiceTypeTrxAttributes"),
    rules: db.collection<RuleDoc>("rules"),
    actions: db.collection<ActionDoc>("actions"),
    settings: db.collection<MailSettingsDoc>("settings"),
    /** same collection as `settings`, the doc `_id: "auth"` */
    authSettings: db.collection<AuthSettingsDoc>("settings"),
    actionAttributes: db.collection<ActionAttributeDoc>("actionAttributes"),
    journeys: db.collection<JourneyDoc>("journeys"),
    journeySteps: db.collection<JourneyStepDoc>("journeySteps"),
    customerJourneys: db.collection<CustomerJourneyDoc>("customerJourneys"),
    customerJourneySteps: db.collection<CustomerJourneyStepDoc>("customerJourneySteps"),
    customerFeedbacks: db.collection<CustomerFeedbackDoc>("customerFeedbacks"),
    services: db.collection<ServiceDoc>("services"),
    servicePutAttributes: db.collection<ServiceAttributeDoc>("servicePutAttributes"),
    serviceGetAttributes: db.collection<ServiceAttributeDoc>("serviceGetAttributes"),
  };
}

export type Collections = ReturnType<typeof collectionsOf>;

// Only the connection is cached across dev hot reloads (and per serverless
// instance). The collection list and indexes come from this module, so after a
// hot reload with a new collection / index they are rebuilt (createIndex is
// idempotent) – no dev server restart needed.
const g = globalThis as unknown as {
  __nexusMautConn?: Promise<Db>;
  __nexusMautInit?: { init: typeof init; done: Promise<void> };
};

export async function collections(): Promise<Collections> {
  g.__nexusMautConn ??= (async () => {
    const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
    await client.connect();
    return client.db(process.env.MONGODB_DB ?? "nexus-maut");
  })().catch((err) => {
    g.__nexusMautConn = undefined; // retry on the next request
    throw err;
  });
  const db = await g.__nexusMautConn;
  if (g.__nexusMautInit?.init !== init) {
    g.__nexusMautInit = {
      init,
      done: init(db).catch((err) => {
        g.__nexusMautInit = undefined;
        throw err;
      }),
    };
  }
  await g.__nexusMautInit.done;
  return collectionsOf(db);
}
