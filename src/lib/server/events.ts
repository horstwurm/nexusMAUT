import "server-only";
import { ObjectId } from "mongodb";
import { ID_REF_LABELS, idRefOf, TRIGGER_SERVICE_TYPE, type IdRef } from "@/lib/events";
import type { EventView } from "@/lib/types";
import { collections, type EventCall, type EventDoc, type EventStart, type JourneyDoc, type ServiceDoc } from "./db";
import { HttpError } from "./http";
import { isIdAttribute, usesIds, type MappedValue } from "@/lib/serviceCall";
import { assignJourney } from "./customerJourneys";
import { sampleIds } from "./customers";
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
  idRef: idRefOf(e),
  journeyId: e.journeyId?.toHexString() ?? null,
  journeyName: journey?.name ?? null,
  lastStart: e.lastStart
    ? { ...e.lastStart, at: e.lastStart.at.toISOString(), byName: userNames.get(e.lastStart.by) ?? "(gelöschter Benutzer)" }
    : null,
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
  const ids = [...new Set(list.flatMap((e) => [e.lastCall?.by, e.lastStart?.by].filter((x): x is string => Boolean(x))))];
  if (!ids.length) return new Map<string, string>();
  const { users } = await collections();
  const names = new Map((await users.find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()).map((u) => [u._id, u.name]));
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

/**
 * Calls the event's trigger service (GET, no input values – an event isn't
 * about one customer) and stores the result as the event's `lastCall`.
 * Service problems are stored too (no sample data), also a missing service /
 * URL; a «Mock» service
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
    lastCall = await callTrigger(service, idRefOf(event), userId);
  }
  const doc = await events.findOneAndUpdate({ _id: id }, { $set: { lastCall } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Event nicht gefunden");
  return (await toEvents([doc]))[0];
}

async function callTrigger(service: ServiceDoc, idRef: IdRef, userId: string): Promise<EventCall> {
  const [putDefs, getDefs] = await Promise.all([serviceAttributeDefs(service._id, "put"), serviceAttributeDefs(service._id, "get")]);
  // a mock answer names real records (their IDs) in «Kundennummer» / «Positionsnummer» / «Transaktionsnummer» attributes
  const ids = service.mock && usesIds(idRef, getDefs) ? { kind: idRef, values: await sampleIds(idRef) } : undefined;
  const res = await callService(service.url ?? "", "GET", putDefs, getDefs, {}, { mock: service.mock, ids });
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

/** The IDs in a call's answer: values of «Kundennummer»- (… «Positionsnummer»-, «Transaktionsnummer»-) like attributes and list columns (distinct). */
export function idsInAnswer(kind: IdRef, values: MappedValue[]) {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if ((typeof v === "string" || typeof v === "number") && String(v).trim()) out.add(String(v).trim());
  };
  for (const v of values) {
    if (v.list) {
      const cols = v.list.columns.filter((c) => isIdAttribute(kind, c.attribute)).map((c) => c.attribute);
      for (const row of v.list.rows) for (const c of cols) add(row.values[c]);
    } else if (isIdAttribute(kind, v.attribute)) add(v.value);
  }
  return [...out];
}

const ID_NAME: Record<IdRef, string> = { customer: "Kundennummern", position: "Positionsnummern", transaction: "Transaktionsnummern" };

/**
 * The customers behind IDs of the kind: an ID is the record's «ID» (externalId)
 * or, for records without one, its internal id; positions and transactions lead
 * to their customer. Returns the distinct customers and the IDs not found.
 */
async function customersOfIds(kind: IdRef, numbers: string[]) {
  const c = await collections();
  const col = kind === "customer" ? c.customers : kind === "position" ? c.customerPositions : c.positionTransactions;
  const oids = numbers.filter((n) => /^[0-9a-f]{24}$/i.test(n)).map((n) => new ObjectId(n.toLowerCase()));
  const matches = await (col as typeof c.positionTransactions)
    .find({ $or: [{ externalId: { $in: numbers } }, { _id: { $in: oids } }] }, { projection: { _id: 1, externalId: 1, customerId: 1 } })
    .toArray();
  const known = new Set(matches.flatMap((m) => [m._id.toHexString(), ...(m.externalId ? [m.externalId] : [])]));
  const customerIds = new Map<string, ObjectId>();
  for (const m of matches) {
    const cid = kind === "customer" ? m._id : m.customerId;
    customerIds.set(cid.toHexString(), cid);
  }
  return { customerIds: [...customerIds.values()], unknown: numbers.filter((n) => !known.has(n) && !known.has(n.toLowerCase())) };
}

/**
 * «Journeys starten»: the event's journey for every customer named in its last
 * service call – by Kundennummer, or by Positions- / Transaktionsnummer leading to
 * their customer (`idRef`). Customers with an active run of the journey are
 * skipped (assignJourney), unknown IDs reported.
 */
export async function startEventJourneys(id: ObjectId, userId: string) {
  const { events } = await collections();
  const event = await events.findOne({ _id: id });
  if (!event) throw new HttpError(404, "Event nicht gefunden");
  if (!event.journeyId) throw new HttpError(409, "Dem Event ist keine Journey zugeordnet – unter Administration → Events wählen");
  if (!event.lastCall?.values) throw new HttpError(409, "Zuerst den Trigger-Service aufrufen – der letzte Aufruf hat keine Werte geliefert");
  const kind = idRefOf(event);
  const numbers = idsInAnswer(kind, event.lastCall.values);
  if (!numbers.length) throw new HttpError(409, `Der letzte Aufruf nennt keine ${ID_NAME[kind]} (ID-Bezug «${ID_REF_LABELS[kind]}»)`);
  const { customerIds: found, unknown } = await customersOfIds(kind, numbers);
  const res = found.length ? await assignJourney({ journeyId: event.journeyId, customerIds: found, event: { id: event._id, name: event.name }, userId }) : { created: 0, skipped: 0 };
  const lastStart: EventStart = { at: new Date(), by: userId, numbers: numbers.length, created: res.created, skipped: res.skipped, unknown: unknown.slice(0, 20) };
  const doc = await events.findOneAndUpdate({ _id: id }, { $set: { lastStart } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Event nicht gefunden");
  return (await toEvents([doc]))[0];
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
