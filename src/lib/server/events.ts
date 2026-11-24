import "server-only";
import { ObjectId } from "mongodb";
import { TRIGGER_SERVICE_TYPE } from "@/lib/events";
import type { EventView } from "@/lib/types";
import { collections, type EventCall, type EventDoc, type JourneyDoc, type ServiceDoc } from "./db";
import { HttpError } from "./http";
import { usesCustomerNumbers } from "@/lib/serviceCall";
import { sampleCustomerNumbers } from "./customers";
import { callService } from "./serviceCaller";
import { serviceAttributeDefs } from "./services";

export const toEvent = (
  e: EventDoc,
  service: Pick<ServiceDoc, "name" | "serviceType"> | null,
  journey: Pick<JourneyDoc, "name"> | null,
  userNames: Map<string, string> = new Map(),
): EventView => ({
  id: e._id.toHexString(),
  name: e.name,
  description: e.description,
  serviceId: e.serviceId.toHexString(),
  serviceName: service?.name ?? null,
  serviceIsTrigger: service?.serviceType === TRIGGER_SERVICE_TYPE,
  updateFrequency: e.updateFrequency,
  journeyId: e.journeyId?.toHexString() ?? null,
  journeyName: journey?.name ?? null,
  lastCall: e.lastCall
    ? {
        ...e.lastCall,
        at: e.lastCall.at.toISOString(),
        byName: userNames.get(e.lastCall.by) ?? "(gelöschter Benutzer)",
      }
    : null,
  updatedAt: e.updatedAt.toISOString(),
});

const idsOf = (list: (ObjectId | undefined)[]) =>
  [...new Set(list.filter((id): id is ObjectId => Boolean(id)).map((id) => id.toHexString()))].map((id) => new ObjectId(id));

/** Names of the users who made the events' last calls. */
async function callerNames(list: EventDoc[]) {
  const ids = [...new Set(list.flatMap((e) => (e.lastCall ? [e.lastCall.by] : [])))];
  if (!ids.length) return new Map<string, string>();
  const { users } = await collections();
  const names = new Map((await users.find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()).map((u) => [u._id, u.name]));
  names.set(TIMER_CALLER, "Zeitgeber (automatisch)");
  return names;
}

/** Events as views, with their service's and journey's names. */
export async function toEvents(list: EventDoc[]) {
  const { services, journeys } = await collections();
  const [svc, jrn, userNames] = await Promise.all([
    services.find({ _id: { $in: idsOf(list.map((e) => e.serviceId)) } }).toArray(),
    journeys.find({ _id: { $in: idsOf(list.map((e) => e.journeyId)) } }).toArray(),
    callerNames(list),
  ]);
  const serviceById = new Map(svc.map((s) => [s._id.toHexString(), s]));
  const journeyById = new Map(jrn.map((j) => [j._id.toHexString(), j]));
  return list.map((e) =>
    toEvent(
      e,
      serviceById.get(e.serviceId.toHexString()) ?? null,
      (e.journeyId && journeyById.get(e.journeyId.toHexString())) || null,
      userNames,
    ),
  );
}

/** All events, by name. */
export async function listEvents() {
  const { events } = await collections();
  return toEvents(await events.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray());
}

/** `lastCall.by` of the background timer (eventTimer.ts). */
export const TIMER_CALLER = "system:timer";

/**
 * Calls the event's trigger service (GET, no input values – an event isn't
 * about one customer) and stores the result as the event's `lastCall`.
 * Service problems are stored too (no sample data), also a missing service /
 * URL – so the timer doesn't retry before the next due time; a «Mock» service
 * answers with random values.
 */
export async function callEventService(id: ObjectId, userId: string) {
  const { events, services } = await collections();
  const event = await events.findOne({ _id: id });
  if (!event) throw new HttpError(404, "Event nicht gefunden");
  const service = await services.findOne({ _id: event.serviceId });
  const problem = !service
    ? "Den Trigger-Service des Events gibt es nicht mehr"
    : !service.url && !service.mock
      ? `Für den Service «${service.name}» ist keine URL erfasst`
      : null;
  let lastCall: EventCall;
  if (!service || problem) {
    lastCall = {
      at: new Date(),
      by: userId,
      serviceName: service?.name ?? "(gelöschter Service)",
      url: service?.url ?? "",
      ok: false,
      mock: false,
      httpStatus: null,
      durationMs: null,
      error: problem,
      values: null,
      raw: null,
    };
  } else {
    lastCall = await callTrigger(service, userId);
  }
  const doc = await events.findOneAndUpdate({ _id: id }, { $set: { lastCall }, $unset: { callLockedUntil: "" } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Event nicht gefunden");
  return (await toEvents([doc]))[0];
}

async function callTrigger(service: ServiceDoc, userId: string): Promise<EventCall> {
  const [putDefs, getDefs] = await Promise.all([serviceAttributeDefs(service._id, "put"), serviceAttributeDefs(service._id, "get")]);
  // a mock answer names real customers (ids) in «Kundennummer» attributes
  const customerNumbers = service.mock && usesCustomerNumbers(getDefs) ? await sampleCustomerNumbers() : undefined;
  const res = await callService(service.url ?? "", "GET", putDefs, getDefs, {}, { mock: service.mock, customerNumbers });
  return {
    at: new Date(),
    by: userId,
    serviceName: service.name,
    url: res.request.url,
    ok: Boolean(res.response?.ok) && !res.error,
    mock: Boolean(res.random),
    httpStatus: res.response?.status ?? null,
    durationMs: res.response?.durationMs ?? null,
    error: res.error,
    values: res.mapped,
    raw: res.response?.raw ?? null,
  };
}

/** The event's journey: it must exist. */
export async function requireEventJourney(id: string) {
  const { journeys } = await collections();
  const journey = await journeys.findOne({ _id: new ObjectId(id) });
  if (!journey) throw new HttpError(400, "Die gewählte Journey gibt es nicht mehr");
  return journey;
}

/**
 * The event's service: it must exist and be a trigger service – unless the
 * event keeps the service it already has (its type may have changed since).
 */
export async function requireTriggerService(id: string, current?: ObjectId) {
  const { services } = await collections();
  const service = await services.findOne({ _id: new ObjectId(id) });
  if (!service) throw new HttpError(400, "Den gewählten Service gibt es nicht mehr");
  if (service.serviceType !== TRIGGER_SERVICE_TYPE && !current?.equals(service._id))
    throw new HttpError(400, `«${service.name}» ist kein Trigger-Service (Servicetyp «${TRIGGER_SERVICE_TYPE}»)`);
  return service;
}

/** Names of the events that belong to a journey (to refuse deleting it). */
export async function eventsOfJourney(journeyId: ObjectId) {
  const { events } = await collections();
  return (await events.find({ journeyId }, { projection: { name: 1 } }).sort({ name: 1 }).toArray()).map((e) => `«${e.name}»`);
}

/** Names of the events a service triggers (to refuse deleting it / changing its type). */
export async function eventsOfService(serviceId: ObjectId) {
  const { events } = await collections();
  return (await events.find({ serviceId }, { projection: { name: 1 } }).sort({ name: 1 }).toArray()).map((e) => `«${e.name}»`);
}
