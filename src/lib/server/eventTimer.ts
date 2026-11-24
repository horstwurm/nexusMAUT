import "server-only";
import { isDue } from "@/lib/eventSchedule";
import { collections } from "./db";
import { callEventService, TIMER_CALLER } from "./events";

// Background timer for the events' trigger services: started once per server
// process from src/instrumentation.ts, checks every minute which events are due
// by their «Aktualisierung» (eventSchedule.ts – from the last call, manual ones
// never) and calls their services (callEventService, stored as `lastCall`).
// Each event is claimed first (`callLockedUntil`, atomic), so several servers on
// the same database – the live app and a dev server – never call it twice.
//
// Off by default (event handling is to be reworked first); EVENT_TIMER=on
// switches it on – mind that dev works on the live database. A timer only runs while its server process
// runs: fine for `next start` / a container; on Vercel (serverless) it runs
// only while an instance is alive – a cron job would be the reliable way there.

const TICK_MS = 60_000;
/** a claim expires after this – a crashed run doesn't block the event for long */
const LOCK_MS = 2 * 60_000;
const PARALLEL = 4;

const g = globalThis as unknown as { __nexusMautEventTimer?: { timer: NodeJS.Timeout; running: boolean } };

export function eventTimerEnabled() {
  return process.env.EVENT_TIMER?.toLowerCase() === "on";
}

/** Calls every due event's trigger service once. Returns what it did (for logs and tests). */
export async function runDueEvents(now = new Date()) {
  const { events } = await collections();
  const candidates = await events
    .find({ updateFrequency: { $ne: "manual" } }, { projection: { updateFrequency: 1, lastCall: 1, callLockedUntil: 1 } })
    .toArray();
  const due = candidates.filter((e) => isDue(e.updateFrequency, e.lastCall?.at ?? null, now));
  let called = 0;
  let failed = 0;
  const queue = [...due];
  async function worker() {
    for (let e = queue.shift(); e; e = queue.shift()) {
      // claim it – unless another server has (or just called it: lastCall changed since we read it)
      const claimed = await events.updateOne(
        {
          _id: e._id,
          "lastCall.at": e.lastCall?.at ?? { $exists: false },
          $or: [{ callLockedUntil: { $exists: false } }, { callLockedUntil: { $lt: now } }],
        },
        { $set: { callLockedUntil: new Date(Date.now() + LOCK_MS) } },
      );
      if (!claimed.modifiedCount) continue;
      try {
        const view = await callEventService(e._id, TIMER_CALLER);
        if (view.lastCall?.ok || view.lastCall?.mock) called++;
        else failed++;
      } catch (err) {
        failed++;
        console.error("[event timer]", e._id.toHexString(), err);
        await events.updateOne({ _id: e._id }, { $unset: { callLockedUntil: "" } });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  return { due: due.length, called, failed };
}

/** Starts the timer (once per process; a hot reload keeps the running one). */
export function startEventTimer() {
  if (!eventTimerEnabled() || g.__nexusMautEventTimer) return;
  const state = { running: false, timer: undefined as unknown as NodeJS.Timeout };
  const tick = async () => {
    if (state.running) return; // the previous run is still busy
    state.running = true;
    try {
      const r = await runDueEvents();
      if (r.due) console.log(`[event timer] ${r.due} fällig, ${r.called} aufgerufen, ${r.failed} mit Fehler`);
    } catch (err) {
      console.error("[event timer]", err);
    } finally {
      state.running = false;
    }
  };
  state.timer = setInterval(tick, TICK_MS);
  state.timer.unref?.();
  g.__nexusMautEventTimer = state;
  setTimeout(tick, 5_000).unref?.(); // first check shortly after the start
  console.log("[event timer] gestartet – prüft jede Minute die fälligen Events");
}
