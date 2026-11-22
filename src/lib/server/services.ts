import "server-only";
import type { ObjectId } from "mongodb";
import type { ServiceAttrDef } from "@/lib/serviceCall";
import type { ServiceAttributeKind } from "@/lib/services";
import type { ServiceView } from "@/lib/types";
import { collections, type ServiceAttributeDoc, type ServiceDoc } from "./db";
import { toTypeAttribute } from "./domains";
import { HttpError } from "./http";

// Services with their two attribute relations: putAttributes / getAttributes
// (kinds in src/lib/services.ts).

export async function serviceAttributeCollection(kind: ServiceAttributeKind) {
  const c = await collections();
  return kind === "put" ? c.servicePutAttributes : c.serviceGetAttributes;
}

export const toService = (s: ServiceDoc, attributeCounts = { put: 0, get: 0 }): ServiceView => ({
  id: s._id.toHexString(),
  name: s.name,
  serviceType: s.serviceType,
  url: s.url ?? "",
  mock: s.mock ?? false,
  updatedAt: s.updatedAt.toISOString(),
  attributeCounts,
});

export const toServiceAttribute = (a: ServiceAttributeDoc) => ({ ...toTypeAttribute({ ...a, typeId: null }), list: a.list ?? null });

async function countBy(kind: ServiceAttributeKind) {
  const rows = await (await serviceAttributeCollection(kind))
    .aggregate<{ _id: ObjectId; n: number }>([{ $group: { _id: "$serviceId", n: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((r) => [r._id.toHexString(), r.n]));
}

/** All services, by name, with their attribute counts. */
export async function listServices() {
  const { services } = await collections();
  const [list, put, get] = await Promise.all([
    services.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    countBy("put"),
    countBy("get"),
  ]);
  return list.map((s) => toService(s, { put: put.get(s._id.toHexString()) ?? 0, get: get.get(s._id.toHexString()) ?? 0 }));
}

export async function serviceCounts(id: ObjectId) {
  const c = await collections();
  const [put, get] = await Promise.all([c.servicePutAttributes.countDocuments({ serviceId: id }), c.serviceGetAttributes.countDocuments({ serviceId: id })]);
  return { put, get };
}

/** 404 unless the service exists (parent of the attribute routes). */
export async function requireService(id: ObjectId) {
  const { services } = await collections();
  const doc = await services.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Service nicht gefunden");
  return doc;
}

/** A service's PUT or GET attributes as definitions for parsing / mapping (GET may contain lists). */
export async function serviceAttributeDefs(serviceId: ObjectId, kind: ServiceAttributeKind): Promise<ServiceAttrDef[]> {
  const list = await (await serviceAttributeCollection(kind)).find({ serviceId }).sort({ sort: 1, attribute: 1 }).toArray();
  return list.map((a) => ({ id: a._id.toHexString(), attribute: a.attribute, attributeType: a.attributeType, options: a.options, list: a.list ?? null }));
}
