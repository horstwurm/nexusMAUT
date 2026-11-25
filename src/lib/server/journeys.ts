import "server-only";
import type { ObjectId } from "mongodb";
import { journeyTypeOf } from "@/lib/journeyTypes";
import type { FeedbackOptionView, JourneyView, JourneyStepView } from "@/lib/types";
import { collections, type JourneyDoc, type JourneyStepDoc, type JourneyStepFeedbackOptionDoc } from "./db";
import { HttpError } from "./http";

export const toJourney = (j: JourneyDoc, stepCount = 0): JourneyView => ({
  id: j._id.toHexString(),
  name: j.name,
  description: j.description,
  journeyType: journeyTypeOf(j),
  updatedAt: j.updatedAt.toISOString(),
  stepCount,
});

export const toFeedbackOption = (o: JourneyStepFeedbackOptionDoc): FeedbackOptionView => ({
  id: o._id.toHexString(),
  stepId: o.stepId.toHexString(),
  option: o.option,
  meaning: o.meaning,
  sort: o.sort,
});

export const toStep = (s: JourneyStepDoc, options: JourneyStepFeedbackOptionDoc[] = []): JourneyStepView => ({
  id: s._id.toHexString(),
  journeyId: s.journeyId.toHexString(),
  actionId: s.actionId.toHexString(),
  content: s.content ?? "",
  sort: s.sort,
  updatedAt: s.updatedAt.toISOString(),
  feedbackOptions: options.filter((o) => o.stepId.equals(s._id)).map(toFeedbackOption),
});

/** The feedback options of the given steps, in order. */
export async function feedbackOptionsOf(stepIds: ObjectId[]) {
  const { feedbackOptions } = await collections();
  return feedbackOptions.find({ stepId: { $in: stepIds } }).sort({ sort: 1, createdAt: 1 }).toArray();
}

/** 404 unless the step belongs to the journey (parent of the feedback option routes). */
export async function requireStep(journeyId: ObjectId, stepId: ObjectId) {
  const { journeySteps } = await collections();
  const doc = await journeySteps.findOne({ _id: stepId, journeyId });
  if (!doc) throw new HttpError(404, "Schritt nicht gefunden");
  return doc;
}

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
