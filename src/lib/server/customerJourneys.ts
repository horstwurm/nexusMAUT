import "server-only";
import { ObjectId } from "mongodb";
import type { CustomerFeedbackView, CustomerJourneyStepView, CustomerJourneyView } from "@/lib/types";
import { collections, type CustomerFeedbackDoc, type CustomerJourneyDoc, type CustomerJourneyStepDoc } from "./db";
import { toFeedbackOption } from "./journeys";
import { HttpError } from "./http";
import { loadRuleDataset, matchingCustomers } from "./rules";
import { previewStep, type ServiceCache, type StepPreview } from "./stepPreview";

// KundenJourneys: journeys assigned to customers and their progress per step.
// Assigning copies the template steps; marking a step done renders its
// content for the customer (placeholders filled, services called) and keeps it.
// The run's status follows its steps: all done / skipped → done.

const progressOf = (steps: Pick<CustomerJourneyStepDoc, "status">[]) => ({
  done: steps.filter((s) => s.status === "done").length,
  skipped: steps.filter((s) => s.status === "skipped").length,
  total: steps.length,
});

/** List rows with customer / journey names and progress. */
export async function toCustomerJourneyViews(list: CustomerJourneyDoc[]): Promise<CustomerJourneyView[]> {
  if (!list.length) return [];
  const { customers, journeys, customerJourneySteps } = await collections();
  const [cs, js, steps] = await Promise.all([
    customers.find({ _id: { $in: [...new Set(list.map((x) => x.customerId))] } }, { projection: { name: 1, lastname: 1 } }).toArray(),
    journeys.find({ _id: { $in: [...new Set(list.map((x) => x.journeyId))] } }, { projection: { name: 1 } }).toArray(),
    customerJourneySteps.find({ customerJourneyId: { $in: list.map((x) => x._id) } }, { projection: { customerJourneyId: 1, status: 1, dataStatus: 1 } }).toArray(),
  ]);
  const cName = new Map(cs.map((c) => [c._id.toHexString(), `${c.name} ${c.lastname}`]));
  const jName = new Map(js.map((j) => [j._id.toHexString(), j.name]));
  return list.map((x) => ({
    id: x._id.toHexString(),
    customerId: x.customerId.toHexString(),
    customerName: cName.get(x.customerId.toHexString()) ?? "(gelöschter Kunde)",
    journeyId: x.journeyId.toHexString(),
    journeyName: jName.get(x.journeyId.toHexString()) ?? "(gelöschte Journey)",
    status: x.status,
    source: x.source.kind === "rule" ? { kind: "rule", ruleId: x.source.ruleId.toHexString(), ruleName: x.source.ruleName } : { kind: "manual" },
    startedAt: x.startedAt.toISOString(),
    completedAt: x.completedAt?.toISOString() ?? null,
    progress: progressOf(steps.filter((s) => s.customerJourneyId.equals(x._id))),
    dataErrors: steps.filter((s) => s.customerJourneyId.equals(x._id) && s.dataStatus === "error").length,
  }));
}

export const toFeedbackView = (f: CustomerFeedbackDoc): CustomerFeedbackView => ({
  id: f._id.toHexString(),
  feedback: f.feedback,
  feedbackComment: f.feedbackComment,
  feedbackRating: f.feedbackRating,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
});

export async function toStepViews(list: CustomerJourneyStepDoc[]): Promise<CustomerJourneyStepView[]> {
  const { actions, customerFeedbacks, feedbackOptions } = await collections();
  const [feedbacks, options] = await Promise.all([
    customerFeedbacks.find({ customerJourneyStepId: { $in: list.map((s) => s._id) } }).sort({ createdAt: 1 }).toArray(),
    // the options of the template step (live, not copied: a deleted template step has none)
    feedbackOptions.find({ stepId: { $in: [...new Map(list.map((s) => [s.stepId.toHexString(), s.stepId])).values()] } }).sort({ sort: 1, createdAt: 1 }).toArray(),
  ]);
  const names = new Map(
    (await actions.find({ _id: { $in: [...new Set(list.map((s) => s.actionId))] } }, { projection: { name: 1 } }).toArray()).map((a) => [
      a._id.toHexString(),
      a.name,
    ]),
  );
  return list.map((s) => ({
    id: s._id.toHexString(),
    stepId: s.stepId.toHexString(),
    actionId: s.actionId.toHexString(),
    actionName: names.get(s.actionId.toHexString()) ?? "(gelöschte Aktion)",
    template: s.template,
    sort: s.sort,
    status: s.status,
    content: s.content,
    unfilled: s.unfilled,
    doneAt: s.doneAt?.toISOString() ?? null,
    note: s.note,
    dataStatus: s.dataStatus ?? "unchecked",
    dataProblems: s.dataProblems ?? [],
    dataCheckedAt: s.dataCheckedAt?.toISOString() ?? null,
    feedbacks: feedbacks.filter((f) => f.customerJourneyStepId.equals(s._id)).map(toFeedbackView),
    feedbackOptions: options.filter((o) => o.stepId.equals(s.stepId)).map(toFeedbackOption),
  }));
}

/**
 * Assigns a journey to customers (by id, or all matching a rule). Customers
 * with an active run of this journey are skipped. Returns the counts.
 */
export async function assignJourney(p: { journeyId: ObjectId; customerIds?: ObjectId[]; ruleId?: ObjectId; userId: string }) {
  const c = await collections();
  const journey = await c.journeys.findOne({ _id: p.journeyId });
  if (!journey) throw new HttpError(404, "Journey nicht gefunden");
  const steps = await c.journeySteps.find({ journeyId: journey._id }).sort({ sort: 1, createdAt: 1 }).toArray();
  if (!steps.length) throw new HttpError(400, `Die Journey «${journey.name}» hat noch keine Schritte`);

  let customerIds: ObjectId[];
  let source: CustomerJourneyDoc["source"];
  if (p.ruleId) {
    const rule = await c.rules.findOne({ _id: p.ruleId });
    if (!rule) throw new HttpError(404, "Kunden Selektion nicht gefunden");
    customerIds = matchingCustomers(rule, await loadRuleDataset()).map((x) => x.id);
    source = { kind: "rule", ruleId: rule._id, ruleName: rule.name };
  } else {
    const ids = p.customerIds ?? [];
    customerIds = (await c.customers.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id);
    if (customerIds.length !== new Set(ids.map((i) => i.toHexString())).size) throw new HttpError(400, "Unbekannter Kunde in der Auswahl");
    source = { kind: "manual" };
  }

  const active = new Set(
    (await c.customerJourneys.find({ journeyId: journey._id, status: "active", customerId: { $in: customerIds } }, { projection: { customerId: 1 } }).toArray()).map(
      (x) => x.customerId.toHexString(),
    ),
  );
  const now = new Date();
  let created = 0;
  for (const customerId of customerIds) {
    if (active.has(customerId.toHexString())) continue;
    const id = new ObjectId();
    try {
      await c.customerJourneys.insertOne({
        _id: id,
        customerId,
        journeyId: journey._id,
        status: "active",
        source,
        startedAt: now,
        completedAt: null,
        createdBy: p.userId,
        updatedAt: now,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // assigned in parallel
      throw err;
    }
    await c.customerJourneySteps.insertMany(
      steps.map((s) => ({
        _id: new ObjectId(),
        customerJourneyId: id,
        customerId,
        stepId: s._id,
        actionId: s.actionId,
        template: s.content ?? "",
        sort: s.sort,
        status: "open" as const,
        content: null,
        unfilled: [],
        doneAt: null,
        note: "",
        dataStatus: "unchecked" as const,
        dataProblems: [],
        dataCheckedAt: null,
        updatedAt: now,
      })),
    );
    created++;
  }
  return { created, skipped: customerIds.length - created, matched: customerIds.length };
}

/** Sets a step's status; «done» renders the content for the customer. Then updates the run's status. */
export async function setStepStatus(runId: ObjectId, stepId: ObjectId, status: CustomerJourneyStepDoc["status"], note?: string) {
  const c = await collections();
  const run = await c.customerJourneys.findOne({ _id: runId });
  if (!run) throw new HttpError(404, "KundenJourney nicht gefunden");
  if (run.status === "cancelled") throw new HttpError(409, "Die KundenJourney ist abgebrochen – zuerst reaktivieren");
  const step = await c.customerJourneySteps.findOne({ _id: stepId, customerJourneyId: runId });
  if (!step) throw new HttpError(404, "Schritt nicht gefunden");
  // reopening a step of a finished run makes it active again – not possible while
  // the customer already runs the same journey again
  if (run.status === "done" && status === "open") {
    const again = await c.customerJourneys.findOne({ customerId: run.customerId, journeyId: run.journeyId, status: "active" });
    if (again) throw new HttpError(409, "Der Kunde hat diese Journey bereits wieder aktiv");
  }
  const now = new Date();
  const set: Partial<CustomerJourneyStepDoc> = { status, updatedAt: now, ...(note !== undefined && { note }) };
  if (status === "done") {
    const preview = await previewStep(step.template, run.customerId);
    set.content = preview.segments.map((s) => (s.kind === "text" ? s.text : (s.value ?? s.token))).join("");
    set.unfilled = preview.segments.filter((s) => s.kind === "placeholder" && s.value === null).map((s) => (s as { token: string }).token);
    set.doneAt = now;
    // rendering is a data check, too
    Object.assign(set, dataResult(preview, now));
  } else {
    set.content = null;
    set.unfilled = [];
    set.doneAt = null;
  }
  await c.customerJourneySteps.updateOne({ _id: step._id }, { $set: set });
  await updateRunStatus(runId);
}

/** active ↔ done by the steps (a cancelled run stays cancelled). */
export async function updateRunStatus(runId: ObjectId) {
  const c = await collections();
  const run = await c.customerJourneys.findOne({ _id: runId });
  if (!run || run.status === "cancelled") return;
  const steps = await c.customerJourneySteps.find({ customerJourneyId: runId }, { projection: { status: 1 } }).toArray();
  const finished = steps.length > 0 && steps.every((s) => s.status !== "open");
  const now = new Date();
  if (finished && run.status !== "done") {
    await c.customerJourneys.updateOne({ _id: runId }, { $set: { status: "done", completedAt: now, updatedAt: now } });
  } else if (!finished && run.status === "done") {
    // reopened – back to active, unless the customer started the same journey again meanwhile
    try {
      await c.customerJourneys.updateOne({ _id: runId }, { $set: { status: "active", completedAt: null, updatedAt: now } });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new HttpError(409, "Der Kunde hat diese Journey bereits wieder aktiv");
      throw err;
    }
  }
}

export type JourneyRunCounts = { journeyId: string; active: number; done: number; cancelled: number };

/** Number of runs per journey and status (the journey list on the KundenJourneys page). */
export async function journeyRunCounts(): Promise<JourneyRunCounts[]> {
  const { customerJourneys } = await collections();
  const rows = await customerJourneys
    .aggregate<{ _id: { j: ObjectId; s: CustomerJourneyDoc["status"] }; n: number }>([{ $group: { _id: { j: "$journeyId", s: "$status" }, n: { $sum: 1 } } }])
    .toArray();
  const out = new Map<string, JourneyRunCounts>();
  for (const r of rows) {
    const id = r._id.j.toHexString();
    const c = out.get(id) ?? { journeyId: id, active: 0, done: 0, cancelled: 0 };
    c[r._id.s] = r.n;
    out.set(id, c);
  }
  return [...out.values()];
}

/** dataStatus from a rendered step: placeholders without a value and service errors are data problems. */
function dataResult(preview: StepPreview, at: Date): Pick<CustomerJourneyStepDoc, "dataStatus" | "dataProblems" | "dataCheckedAt"> {
  const problems = [
    ...preview.segments.flatMap((s) => (s.kind === "placeholder" && s.value === null ? [`${s.token}: ${s.note ?? "kein Wert"}`] : [])),
    ...preview.services.flatMap((r) => (r.status === "error" ? [`Service «${r.name}»: ${r.message ?? "Fehler"}`] : [])),
  ];
  return { dataStatus: problems.length ? "error" : "ok", dataProblems: [...new Set(problems)], dataCheckedAt: at };
}

/**
 * «Daten prüfen»: renders the open steps of the active runs (of a journey, or
 * one run) for their customer and sets dataStatus ok / error with the problems.
 * Each service is called once per customer. Done / skipped steps keep theirs.
 */
export async function checkData(p: { journeyId?: ObjectId; customerJourneyId?: ObjectId }) {
  const c = await collections();
  const runs = await c.customerJourneys
    .find(p.customerJourneyId ? { _id: p.customerJourneyId } : { journeyId: p.journeyId, status: "active" }, { projection: { customerId: 1, status: 1 } })
    .toArray();
  if (p.customerJourneyId && !runs.length) throw new HttpError(404, "KundenJourney nicht gefunden");
  const steps = await c.customerJourneySteps.find({ customerJourneyId: { $in: runs.map((r) => r._id) }, status: "open" }).toArray();
  const customerOf = new Map(runs.map((r) => [r._id.toHexString(), r.customerId]));
  const cache: ServiceCache = new Map();
  const now = new Date();
  let ok = 0;
  let errors = 0;
  let failed = 0;
  for (const step of steps) {
    let set: Partial<CustomerJourneyStepDoc>;
    try {
      set = dataResult(await previewStep(step.template, customerOf.get(step.customerJourneyId.toHexString())!, cache), now);
    } catch (err) {
      // e.g. the customer is gone
      set = { dataStatus: "error", dataProblems: [err instanceof Error ? err.message : "Prüfung fehlgeschlagen"], dataCheckedAt: now };
      failed++;
    }
    if (set.dataStatus === "ok") ok++;
    else errors++;
    await c.customerJourneySteps.updateOne({ _id: step._id }, { $set: set });
  }
  return { runs: runs.length, steps: steps.length, ok, errors, failed };
}
