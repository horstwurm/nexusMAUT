import "server-only";
import type { ObjectId } from "mongodb";
import type { ExecutionPreview, ExecutionResult } from "@/lib/types";
import { dataResult, updateRunStatus } from "./customerJourneys";
import { collections, type ActionDoc, type CustomerJourneyDoc, type CustomerJourneyStepDoc } from "./db";
import { appUrl, HttpError } from "./http";
import { previewStep, type ServiceCache, type StepPreview } from "./stepPreview";

// «Ausführen» on the KundenJourneys page: every step «Bereit zur Ausführung»
// (ready) of the journey's active runs is rendered for its customer and POSTed
// as JSON to its action's URL. Answer 2xx → the step is done (content kept,
// like «Erledigt»); otherwise it stays ready and the error is noted. Steps
// whose data are missing (placeholder without value, service error) or whose
// action has no URL aren't sent. The receiving system reports the customer's
// feedback via `feedbackUrl` with the action's API key.

const SEND_TIMEOUT_MS = 10_000;
/** stop starting new sends after this – the function has 60 s */
const TIME_BUDGET_MS = 40_000;
const PARALLEL = 4;

const textOf = (p: StepPreview) => p.segments.map((s) => (s.kind === "text" ? s.text : (s.value ?? s.token))).join("");
const unfilledOf = (p: StepPreview) => p.segments.flatMap((s) => (s.kind === "placeholder" && s.value === null ? [s.token] : []));

/** The JSON a step is handed to its action with (also shown in «API»). */
export async function actionPayload(run: CustomerJourneyDoc, step: CustomerJourneyStepDoc, content: string, unfilled: string[], action: ActionDoc | null) {
  const c = await collections();
  const [journey, customer, options] = await Promise.all([
    c.journeys.findOne({ _id: run.journeyId }, { projection: { name: 1 } }),
    c.customers.findOne({ _id: run.customerId }, { projection: { name: 1, lastname: 1 } }),
    c.feedbackOptions.find({ stepId: step.stepId }).sort({ sort: 1, createdAt: 1 }).toArray(),
  ]);
  return {
    customerJourneyId: run._id.toHexString(),
    customerJourneyStepId: step._id.toHexString(),
    journey: journey?.name ?? "(gelöschte Journey)",
    action: action?.name ?? "(gelöschte Aktion)",
    customer: { id: run.customerId.toHexString(), vorname: customer?.name ?? "", nachname: customer?.lastname ?? "" },
    content,
    unfilled,
    feedbackOptions: options.map((o) => ({ option: o.option, meaning: o.meaning })),
    feedbackUrl: `${appUrl()}/api/customer-journeys/${run._id.toHexString()}/steps/${step._id.toHexString()}/feedbacks`,
  };
}

/** «API» dialog: the request for one step (done: stored content, otherwise rendered now). Sends nothing. */
export async function actionRequest(runId: ObjectId, stepId: ObjectId) {
  const c = await collections();
  const run = await c.customerJourneys.findOne({ _id: runId });
  if (!run) throw new HttpError(404, "KundenJourney nicht gefunden");
  const step = await c.customerJourneySteps.findOne({ _id: stepId, customerJourneyId: run._id });
  if (!step) throw new HttpError(404, "Schritt nicht gefunden");
  const action = await c.actions.findOne({ _id: step.actionId });
  const done = step.status === "done" && typeof step.content === "string";
  let content: string;
  let unfilled: string[];
  if (done) {
    content = step.content!;
    unfilled = step.unfilled ?? [];
  } else {
    const preview = await previewStep(step.template, run.customerId);
    content = textOf(preview);
    unfilled = unfilledOf(preview);
  }
  return {
    action: { name: action?.name ?? "(gelöschte Aktion)", url: action?.url ?? "" },
    contentSource: done ? ("done" as const) : ("preview" as const),
    body: await actionPayload(run, step, content, unfilled, action),
  };
}

async function readySteps(journeyId: ObjectId) {
  const c = await collections();
  const runs = await c.customerJourneys.find({ journeyId, status: "active" }).toArray();
  const steps = await c.customerJourneySteps
    .find({ customerJourneyId: { $in: runs.map((r) => r._id) }, status: "ready" })
    .sort({ customerJourneyId: 1, sort: 1 })
    .toArray();
  const actionIds = [...new Map(steps.map((s) => [s.actionId.toHexString(), s.actionId])).values()];
  const actions = await c.actions.find({ _id: { $in: actionIds } }).toArray();
  return { runs, steps, actions };
}

/** What «Ausführen» would send for a journey. */
export async function executionPreview(journeyId: ObjectId): Promise<ExecutionPreview> {
  const { steps, actions } = await readySteps(journeyId);
  const byId = new Map(actions.map((a) => [a._id.toHexString(), a]));
  const groups = new Map<string, ExecutionPreview["byAction"][number]>();
  for (const s of steps) {
    const id = s.actionId.toHexString();
    const a = byId.get(id);
    const g = groups.get(id) ?? { actionId: id, name: a?.name ?? "(gelöschte Aktion)", url: a?.url ?? "", count: 0 };
    g.count++;
    groups.set(id, g);
  }
  const sendable = steps.filter((s) => byId.get(s.actionId.toHexString())?.url);
  return {
    total: steps.length,
    sendable: sendable.length,
    byAction: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
    knownDataErrors: sendable.filter((s) => s.dataStatus === "error").length,
  };
}

/** POSTs the payload; ok = 2xx. Redirects aren't followed (the URL is the one an admin entered). */
async function send(url: string, payload: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "nexusMAUT" },
      body: JSON.stringify(payload),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok ? { ok: true, httpStatus: res.status } : { ok: false, httpStatus: res.status, error: `Antwort ${res.status}${res.statusText ? ` ${res.statusText}` : ""}` };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, error: timeout ? `keine Antwort innert ${SEND_TIMEOUT_MS / 1000} s` : `nicht erreichbar (${err instanceof Error ? err.message : "Fehler"})` };
  }
}

/** «Ausführen» → «Senden»: renders and sends every ready step of the journey's active runs. */
export async function executeJourney(journeyId: ObjectId, userId: string): Promise<ExecutionResult> {
  const c = await collections();
  const { runs, steps, actions } = await readySteps(journeyId);
  const runOf = new Map(runs.map((r) => [r._id.toHexString(), r]));
  const actionOf = new Map(actions.map((a) => [a._id.toHexString(), a]));
  const result: ExecutionResult = { sent: 0, failed: 0, dataErrors: 0, withoutUrl: 0, remaining: 0, errors: [] };
  const cache: ServiceCache = new Map();
  const touchedRuns = new Set<string>();
  const started = Date.now();
  const queue = [...steps];

  const work = async () => {
    for (let step = queue.shift(); step; step = queue.shift()) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        result.remaining++;
        continue;
      }
      const run = runOf.get(step.customerJourneyId.toHexString())!;
      const action = actionOf.get(step.actionId.toHexString()) ?? null;
      if (!action?.url) {
        result.withoutUrl++;
        continue;
      }
      const now = new Date();
      let preview: StepPreview;
      try {
        preview = await previewStep(step.template, run.customerId, cache);
      } catch (err) {
        result.failed++;
        result.errors.push(`${action.name}: ${err instanceof Error ? err.message : "Aufbereiten fehlgeschlagen"}`);
        continue;
      }
      const data = dataResult(preview, now);
      if (data.dataStatus === "error") {
        // missing data are never sent – the step stays ready, marked «Datenfehler»
        await c.customerJourneySteps.updateOne({ _id: step._id }, { $set: { ...data, updatedAt: now } });
        result.dataErrors++;
        continue;
      }
      const content = textOf(preview);
      const unfilled = unfilledOf(preview);
      const r = await send(action.url, await actionPayload(run, step, content, unfilled, action));
      const execution = { at: new Date(), ok: r.ok, url: action.url, ...(r.httpStatus && { httpStatus: r.httpStatus }), ...(r.error && { error: r.error }), by: userId };
      if (r.ok) {
        // only if still ready (nobody changed it meanwhile)
        await c.customerJourneySteps.updateOne(
          { _id: step._id, status: "ready" },
          { $set: { status: "done", content, unfilled, doneAt: execution.at, ...data, execution, updatedAt: execution.at } },
        );
        touchedRuns.add(run._id.toHexString());
        result.sent++;
      } else {
        await c.customerJourneySteps.updateOne({ _id: step._id }, { $set: { ...data, execution, updatedAt: execution.at } });
        result.failed++;
        if (result.errors.length < 10) result.errors.push(`${action.name} (${action.url}): ${r.error}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, work));
  for (const id of touchedRuns) await updateRunStatus(runOf.get(id)!._id);
  return result;
}
