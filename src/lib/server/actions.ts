import "server-only";
import type { ObjectId } from "mongodb";
import type { ActionView } from "@/lib/types";
import { collections, type ActionAttributeDoc, type ActionDoc } from "./db";
import { toTypeAttribute } from "./domains";
import { HttpError } from "./http";

export const toAction = (a: ActionDoc, attributeCount = 0): ActionView => ({
  id: a._id.toHexString(),
  name: a.name,
  description: a.description,
  url: a.url ?? "",
  updatedAt: a.updatedAt.toISOString(),
  attributeCount,
  apiKey: a.apiKey
    ? { hint: a.apiKey.hint, createdAt: a.apiKey.createdAt.toISOString(), lastUsedAt: a.apiKey.lastUsedAt?.toISOString() ?? null }
    : null,
});

/** All actions, by name, with their number of attributes. */
export async function listActions() {
  const { actions, actionAttributes } = await collections();
  const [list, counts] = await Promise.all([
    actions.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    actionAttributes.aggregate<{ _id: ObjectId; n: number }>([{ $group: { _id: "$actionId", n: { $sum: 1 } } }]).toArray(),
  ]);
  const countOf = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
  return list.map((a) => toAction(a, countOf.get(a._id.toHexString()) ?? 0));
}

/** 404 unless the action exists (parent of the attribute routes). */
export async function requireAction(id: ObjectId) {
  const { actions } = await collections();
  const doc = await actions.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Aktion nicht gefunden");
  return doc;
}

/** Action attributes to the page (same view as type attributes). */
export const toActionAttribute = (a: ActionAttributeDoc) => toTypeAttribute({ ...a, typeId: null });
