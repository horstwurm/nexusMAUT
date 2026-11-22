import "server-only";
import { z } from "zod";
import { dateOfBirthError } from "@/lib/customers";
import { CODE_RE, type DomainName } from "@/lib/domains";
import { listSpecProblem, normalizeListSpec } from "@/lib/serviceCall";
import { COUNT_OPERATORS, OPERATOR_NAMES, rangeProblem, type CustomerField, type Operator } from "@/lib/rules";
import { ATTRIBUTE_TYPE_NAMES, attributeDefinitionError, normalizeOptions, type AttributeType } from "@/lib/typeAttributes";
import { email } from "./http";

// Request body schemas shared by several routes.

export const customerInput = z.object({
  /** customer attribute id → raw value; omitted = keep the stored values */
  attributes: z.record(z.string().max(40), z.unknown()).optional(),
  name: z.string().trim().min(1, "Vorname fehlt").max(100),
  lastname: z.string().trim().min(1, "Nachname fehlt").max(100),
  dateOfBirth: z.string().superRefine((v, ctx) => {
    const problem = dateOfBirthError(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
});

export const domainValueInput = z.object({
  domain: z.enum(["productServiceType", "comPrefs", "serviceType"] satisfies DomainName[]),
  code: z.string().trim().toLowerCase().regex(CODE_RE, "Code: Kleinbuchstaben, Ziffern, - und _ (max. 40)"),
  label: z.string().trim().min(1, "Bezeichnung fehlt").max(100),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(100_000).optional(),
});

/** The code stays fixed – records refer to it. */
export const domainValuePatch = z.object({
  label: z.string().trim().min(1, "Bezeichnung fehlt").max(100).optional(),
  active: z.boolean().optional(),
  sort: z.number().int().min(0).max(100_000).optional(),
});

export const customerProductInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(200),
  productServiceType: z.string().trim().min(1, "Typ fehlt").max(40),
});

export const customerComPrefInput = z.object({
  usageInstruction: z.string().trim().min(1, "Verwendungshinweis fehlt").max(2000),
  comPrefType: z.string().trim().min(1, "Art fehlt").max(40),
});

const attributeFields = {
  attribute: z.string().trim().min(1, "Attribut fehlt").max(100),
  attributeType: z.enum(ATTRIBUTE_TYPE_NAMES as [AttributeType, ...AttributeType[]], { message: "Unbekannter Attributtyp" }),
  options: z.array(z.string().max(100)).max(500).default([]).transform(normalizeOptions),
};

export const typeAttributeInput = z.object(attributeFields).superRefine((v, ctx) => {
  const problem = attributeDefinitionError(v.attributeType, v.options);
  if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["options"] });
});

/**
 * Customer / position / trx attributes: like a type attribute, or a «Service»
 * attribute (`service` set) – then type and options come from the service's
 * GET attribute (resolved by the route, see serviceAttributes.ts).
 */
export const sourcedAttributeInput = z
  .object({
    ...attributeFields,
    service: z
      .object({ serviceId: z.string().regex(/^[0-9a-f]{24}$/, "Service wählen"), attrId: z.string().regex(/^[0-9a-f]{24}$/, "GET-Attribut wählen") })
      .nullable()
      .default(null),
  })
  .superRefine((v, ctx) => {
    if (v.service) return;
    const problem = attributeDefinitionError(v.attributeType, v.options);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["options"] });
  });

/** A transaction: trx attribute id → raw value (checked against the position type's transaction attributes). */
export const transactionInput = z.object({ values: z.record(z.string().max(40), z.unknown()) });

/** A customer position: type + attribute id → raw value (checked against the type's position attributes by `parsePosition`). */
export const customerPositionInput = z.object({
  productServiceType: z.string().trim().min(1, "Typ fehlt").max(40),
  values: z.record(z.string().max(40), z.unknown()),
});

// --- rules ---------------------------------------------------------------------------
const operator = z.enum(OPERATOR_NAMES as [Operator, ...Operator[]], { message: "Unbekannter Operator" });
const countOperator = z.enum(COUNT_OPERATORS as [Operator, ...Operator[]], { message: "Unbekannter Vergleich" });
const ruleValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.array(z.string().max(100)).max(100), z.null()]);
const objectIdHex = z.string().regex(/^[0-9a-f]{24}$/, "Ungültiges Attribut");
/** «zwischen» needs a valid [from, to] range. */
const checkRange = (c: { op: Operator; value: unknown }, ctx: z.RefinementCtx) => {
  const problem = c.op === "between" ? rangeProblem(c.value as never) : null;
  if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["value"] });
};
const attrFilter = z.object({ attrId: objectIdHex, op: operator, value: ruleValue }).superRefine(checkRange);
const typeCode = z.string().trim().min(1, "Typ fehlt").max(40);

export const ruleCondition = z.discriminatedUnion("level", [
  z
    .object({
      level: z.literal("customer"),
      field: z.enum(["name", "lastname", "age", "dateOfBirth", "attribute"] satisfies (CustomerField | "attribute")[]),
      attrId: objectIdHex.nullable().optional(),
      op: operator,
      value: ruleValue,
    })
    .refine((c) => c.field !== "attribute" || c.attrId, { message: "Kundenattribut wählen", path: ["attrId"] })
    .superRefine(checkRange),
  z.object({
    level: z.literal("position"),
    type: typeCode,
    filter: attrFilter.nullable(),
    op: countOperator,
    value: z.number().int().min(0).max(100_000),
  }),
  z
    .object({
      level: z.literal("trx"),
      type: typeCode,
      filter: attrFilter.nullable(),
      period: z.object({ dateAttrId: objectIdHex, days: z.number().int().min(1).max(3650) }).nullable(),
      measure: z.enum(["count", "sum"]),
      sumAttrId: objectIdHex.nullable(),
      op: countOperator,
      value: z.number().finite(),
    })
    .refine((c) => c.measure === "count" || c.sumAttrId, { message: "Für eine Summe ein Zahlen-Attribut wählen", path: ["sumAttrId"] }),
]);

export const ruleInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
  description: z.string().trim().max(1000).default(""),
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(ruleCondition).max(30),
});

/** Optional http(s) address ("" = none) – services, actions. */
export const optionalUrl = z
  .string()
  .trim()
  .max(2000, "URL: höchstens 2000 Zeichen")
  .refine((v) => v === "" || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v), "URL: mit http:// oder https:// beginnen")
  .refine((v) => {
    if (v === "") return true;
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Ungültige URL")
  .default("");

export const actionInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
  description: z.string().trim().max(2000).default(""),
  url: optionalUrl,
});

// --- e-mail settings (Admin) ------------------------------------------------------------
/** "name@example.ch" or "Name <name@example.ch>" */
const SENDER_RE = /^(?:[^<>]*<\s*)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>?$/;

export const mailSettingsInput = z.object({
  host: z.string().trim().min(1, "SMTP-Server fehlt").max(200),
  port: z.number().int().min(1, "Ungültiger Port").max(65535, "Ungültiger Port"),
  user: z.string().trim().max(200).default(""),
  /** empty / omitted = keep the stored password */
  password: z.string().max(500).optional(),
  /** remove the stored password (SMTP without login) */
  clearPassword: z.boolean().default(false),
  from: z.string().trim().max(300).regex(SENDER_RE, "Absender: name@example.ch oder «Name <name@example.ch>»"),
  replyTo: z.union([z.literal(""), email]).default(""),
});

export const testMailInput = z.object({ to: email });

export const journeyInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
  description: z.string().trim().max(2000).default(""),
});

/** A step of a journey: an action and its content (free text). */
export const journeyStepInput = z.object({
  actionId: z.string().regex(/^[0-9a-f]{24}$/, "Aktion wählen"),
  content: z.string().trim().max(10_000, "Inhalt: höchstens 10'000 Zeichen").default(""),
});

/** A service: name + type (domain serviceType); its PUT / GET attributes are separate. */
export const serviceInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
  serviceType: z.string().trim().min(1, "Servicetyp fehlt").max(40),
  url: optionalUrl,
  /** «Mock»: random values instead of calling the service */
  mock: z.boolean().default(false),
});

/** A GET attribute of a service: like a type attribute, or a list (table) with columns. */
export const serviceGetAttributeInput = z
  .object({
    attribute: z.string().trim().min(1, "Attribut fehlt").max(100),
    attributeType: z.enum(ATTRIBUTE_TYPE_NAMES as [AttributeType, ...AttributeType[]], { message: "Unbekannter Attributtyp" }),
    options: z.array(z.string().max(100)).max(500).default([]).transform(normalizeOptions),
    list: z
      .object({
        path: z.string().max(200).default(""),
        columns: z
          .array(
            z.object({
              attribute: z.string().max(100),
              attributeType: z.enum(ATTRIBUTE_TYPE_NAMES as [AttributeType, ...AttributeType[]], { message: "Unbekannter Spaltentyp" }),
              options: z.array(z.string().max(100)).max(500).default([]),
            }),
          )
          .max(100),
      })
      .nullable()
      .default(null)
      .transform((l) => (l ? normalizeListSpec(l) : null)),
  })
  .superRefine((v, ctx) => {
    const problem = v.list ? listSpecProblem(v.list) : attributeDefinitionError(v.attributeType, v.options);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: [v.list ? "list" : "options"] });
  })
  // a list carries no value type / options of its own
  .transform((v) => (v.list ? { ...v, attributeType: "alpha" as AttributeType, options: [] } : v));

// --- KundenJourneys -------------------------------------------------------------------
const hexId = z.string().regex(/^[0-9a-f]{24}$/, "Ungültige ID");

/** Assign a journey to customers – individually (`customerIds`) or all matching a Kunden Selektion (`ruleId`). */
export const assignJourneyInput = z
  .object({
    journeyId: hexId,
    customerIds: z.array(hexId).max(5000).optional(),
    ruleId: hexId.optional(),
  })
  .refine((v) => (v.ruleId ? !v.customerIds?.length : !!v.customerIds?.length), {
    message: "Entweder Kunden oder eine Kunden Selektion wählen",
    path: ["customerIds"],
  });

export const customerJourneyPatch = z.object({ status: z.enum(["active", "cancelled"]) });

export const customerJourneyStepPatch = z.object({
  status: z.enum(["open", "done", "skipped"]),
  note: z.string().trim().max(2000).optional(),
});

/** «Daten prüfen»: the active runs of a journey, or one run. */
export const dataCheckInput = z
  .object({ journeyId: hexId.optional(), customerJourneyId: hexId.optional() })
  .refine((v) => !!v.journeyId !== !!v.customerJourneyId, { message: "Journey oder KundenJourney angeben" });

/** A customer's feedback on a KundenJourney step (relation customerFeedback). */
export const customerFeedbackInput = z.object({
  feedback: z.string().trim().min(1, "Feedback fehlt").max(200),
  feedbackComment: z.string().trim().max(2000).default(""),
  feedbackRating: z.number().int().min(1, "Bewertung 1 – 5").max(5, "Bewertung 1 – 5").nullable().default(null),
});

// --- own login (Admin → Anmeldung «Eigene Anmeldung») ----------------------------

const newPassword = z
  .string()
  .min(8, "Das Passwort braucht mindestens 8 Zeichen")
  .max(200, "Das Passwort ist zu lang (max. 200 Zeichen)");

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(200),
});

export const registerInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(100),
  email,
  password: newPassword,
});

export const forgotPasswordInput = z.object({ email: z.string().trim().toLowerCase().max(254) });

export const resetPasswordInput = z.object({ token: z.string().min(1).max(200), password: newPassword });

/** «Mein Konto»: `currentPassword` only needed when a password is already set */
export const changePasswordInput = z.object({ currentPassword: z.string().max(200).optional(), newPassword });

export const profileInput = z.object({ name: z.string().trim().min(1, "Name fehlt").max(100) });

export const authSettingsInput = z.object({
  mode: z.enum(["nexusIdentity", "local"]),
  allowRegistration: z.boolean(),
});
