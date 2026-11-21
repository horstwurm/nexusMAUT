import "server-only";
import type { ObjectId } from "mongodb";
import type { JourneyView, JourneyStepView } from "@/lib/types";
import { collections, type JourneyDoc, type JourneyStepDoc } from "./db";
import { HttpError } from "./http";

export const toJourney = (j: JourneyDoc, stepCount = 0): JourneyView => ({
  id: j._id.toHexString(),
  name: j.name,
  description: j.description,
  updatedAt: j.updatedAt.toISOString(),
  stepCount,
});

export const toStep = (s: JourneyStepDoc): JourneyStepView => ({
  id: s._id.toHexString(),
  journeyId: s.journeyId.toHexString(),
  actionId: s.actionId.toHexString(),
  content: s.content ?? "",
  sort: s.sort,
  updatedAt: s.updatedAt.toISOString(),
});

/** All journeys, by name, with their number of steps. */
export async function listJourneys() {
  const { journeys, journeySteps } = await collections();
  const [list, counts] = await Promise.all([
    journeys.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    journeySteps.aggregate<{ _id: ObjectId; n: number }>([{ $group: { _id: "$journeyId", n: { $sum: 1 } } }]).toArray(),
  ]);
  const countOf = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
  return list.map((j) => toJourney(j, countOf.get(j._id.toHexString()) ?? 0));
}

/** 404 unless the journey exists (parent of the step routes). */
export async function requireJourney(id: ObjectId) {
  const { journeys } = await collections();
  const doc = await journeys.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Journey nicht gefunden");
  return doc;
}

/** 400 unless the action exists. */
export async function assertAction(id: ObjectId) {
  const { actions } = await collections();
  if (!(await actions.findOne({ _id: id }, { projection: { _id: 1 } }))) throw new HttpError(400, "Unbekannte Aktion");
}
