import "server-only";
import { collections, type ServiceFetched } from "./db";

// Homepage data: the counts for the public landing page and the «Heute» panel
// of the start page (what needs attention in the KundenJourneys).

/** Live counts for the landing page (aggregates only – no names). */
export async function homeStats() {
  const c = await collections();
  const [customers, positions, transactions, rules, journeys, activeRuns, services] = await Promise.all([
    c.customers.estimatedDocumentCount(),
    c.customerPositions.estimatedDocumentCount(),
    c.positionTransactions.estimatedDocumentCount(),
    c.rules.estimatedDocumentCount(),
    c.journeys.estimatedDocumentCount(),
    c.customerJourneys.countDocuments({ status: "active" }),
    c.services.estimatedDocumentCount(),
  ]);
  return { customers, positions, transactions, rules, journeys, activeRuns, services };
}
export type HomeStats = Awaited<ReturnType<typeof homeStats>>;

export type TodayItem = { key: string; urgent: boolean; journeyId: string; journeyName: string; customerName: string; text: string };
export type Today = { activeRuns: number; openSteps: number; dataErrors: number; serviceErrors: number; items: TodayItem[]; more: number };

const hasFetchError = (f: ServiceFetched | undefined) => Object.values(f ?? {}).some((x) => x.error);

/**
 * Start page panel: active KundenJourneys, their open steps, open steps with
 * a data error, records whose last service fetch failed – and the most urgent
 * runs (data errors first, then the longest running with open steps).
 */
export async function today(): Promise<Today> {
  const c = await collections();
  const runs = await c.customerJourneys.find({ status: "active" }, { projection: { customerId: 1, journeyId: 1, startedAt: 1 } }).toArray();
  const openSteps = runs.length
    ? await c.customerJourneySteps
        .find({ customerJourneyId: { $in: runs.map((r) => r._id) }, status: "open" }, { projection: { customerJourneyId: 1, actionId: 1, sort: 1, dataStatus: 1 } })
        .sort({ sort: 1 })
        .toArray()
    : [];
  const withFetch = { serviceFetched: { $exists: true } };
  const projection = { projection: { serviceFetched: 1 } };
  const [cs, ps, ts] = await Promise.all([
    c.customers.find(withFetch, projection).toArray(),
    c.customerPositions.find(withFetch, projection).toArray(),
    c.positionTransactions.find(withFetch, projection).toArray(),
  ]);
  const serviceErrors = [...cs, ...ps, ...ts].filter((d) => hasFetchError(d.serviceFetched)).length;

  // per run: its open steps (in order) and how many have a data error
  const byRun = new Map<string, typeof openSteps>();
  for (const s of openSteps) byRun.set(s.customerJourneyId.toHexString(), [...(byRun.get(s.customerJourneyId.toHexString()) ?? []), s]);
  const candidates = runs
    .filter((r) => byRun.has(r._id.toHexString()))
    .map((r) => {
      const steps = byRun.get(r._id.toHexString())!;
      return { run: r, next: steps[0], errors: steps.filter((s) => s.dataStatus === "error").length };
    })
    .sort((a, b) => b.errors - a.errors || a.run.startedAt.getTime() - b.run.startedAt.getTime());
  const top = candidates.slice(0, 5);
  const [customers, journeys, actions] = await Promise.all([
    c.customers.find({ _id: { $in: top.map((t) => t.run.customerId) } }, { projection: { name: 1, lastname: 1 } }).toArray(),
    c.journeys.find({ _id: { $in: top.map((t) => t.run.journeyId) } }, { projection: { name: 1 } }).toArray(),
    c.actions.find({ _id: { $in: top.map((t) => t.next.actionId) } }, { projection: { name: 1 } }).toArray(),
  ]);
  const name = <T extends { _id: { toHexString(): string } }>(list: T[], id: { toHexString(): string }, f: (x: T) => string, fallback: string) =>
    (() => {
      const x = list.find((y) => y._id.toHexString() === id.toHexString());
      return x ? f(x) : fallback;
    })();
  const items: TodayItem[] = top.map(({ run, next, errors }) => ({
    key: run._id.toHexString(),
    urgent: errors > 0,
    journeyId: run.journeyId.toHexString(),
    journeyName: name(journeys, run.journeyId, (j) => j.name, "(gelöschte Journey)"),
    customerName: name(customers, run.customerId, (x) => `${x.name} ${x.lastname}`, "(gelöschter Kunde)"),
    text:
      errors > 0
        ? `${errors} offene${errors === 1 ? "r" : ""} Schritt${errors === 1 ? "" : "e"} mit Datenfehler`
        : `nächster Schritt «${name(actions, next.actionId, (a) => a.name, "Aktion")}» – läuft seit ${run.startedAt.toLocaleDateString("de-CH")}`,
  }));
  return {
    activeRuns: runs.length,
    openSteps: openSteps.length,
    dataErrors: openSteps.filter((s) => s.dataStatus === "error").length,
    serviceErrors,
    items,
    more: Math.max(0, candidates.length - top.length),
  };
}
