import "server-only";
import { ObjectId } from "mongodb";
import type { AttributeDef } from "@/lib/positions";
import type { AttributeType } from "@/lib/typeAttributes";
import { collections, type ServiceSource } from "./db";
import { HttpError } from "./http";

// «Service» attributes (customer / position / trx attributes whose value comes
// from a simple GET attribute of a service): definitions with source names, and
// checking a source when an attribute is saved.

type AttrDocLike = { _id: ObjectId; attribute: string; attributeType: AttributeType; options: string[]; service?: ServiceSource | null };

/** Attribute docs → definitions, service sources with their names. */
export async function toAttributeDefs(docs: AttrDocLike[]): Promise<AttributeDef[]> {
  const sourced = docs.filter((d) => d.service);
  const names = new Map<string, string>();
  if (sourced.length) {
    const { services, serviceGetAttributes } = await collections();
    const [ss, as] = await Promise.all([
      services.find({ _id: { $in: sourced.map((d) => d.service!.serviceId) } }, { projection: { name: 1 } }).toArray(),
      serviceGetAttributes.find({ _id: { $in: sourced.map((d) => d.service!.attrId) } }, { projection: { attribute: 1 } }).toArray(),
    ]);
    for (const s of ss) names.set(s._id.toHexString(), s.name);
    for (const a of as) names.set(a._id.toHexString(), a.attribute);
  }
  return docs.map((d) => ({
    id: d._id.toHexString(),
    attribute: d.attribute,
    attributeType: d.attributeType,
    options: d.options,
    ...(d.service && {
      service: {
        serviceId: d.service.serviceId.toHexString(),
        attrId: d.service.attrId.toHexString(),
        serviceName: names.get(d.service.serviceId.toHexString()) ?? "(gelöschter Service)",
        attrName: names.get(d.service.attrId.toHexString()) ?? "(gelöschtes Attribut)",
      },
    }),
  }));
}

/**
 * The stored fields of a customer / position / trx attribute: for a «Service»
 * attribute type and options come from the GET attribute (simple, not a list).
 */
export async function resolveAttributeSource<T extends { attributeType: AttributeType; options: string[]; service: { serviceId: string; attrId: string } | null }>(input: T) {
  if (!input.service) return { ...input, service: null };
  const { services, serviceGetAttributes } = await collections();
  const serviceId = new ObjectId(input.service.serviceId);
  const attrId = new ObjectId(input.service.attrId);
  const [service, attr] = await Promise.all([services.findOne({ _id: serviceId }), serviceGetAttributes.findOne({ _id: attrId, serviceId })]);
  if (!service) throw new HttpError(400, "Service nicht gefunden");
  if (!attr) throw new HttpError(400, "GET-Attribut des Services nicht gefunden");
  if (attr.list) throw new HttpError(400, `«${attr.attribute}» ist eine Liste – nur einfache GET-Attribute sind möglich`);
  return { ...input, attributeType: attr.attributeType, options: attr.options, service: { serviceId, attrId } };
}

/** Customer / position / trx attributes that use a service (or one of its GET attributes). */
export async function serviceSourceUsage(filter: { serviceId: ObjectId } | { attrId: ObjectId }) {
  const { customerAttributes, positionAttributes, trxAttributes } = await collections();
  const q = "serviceId" in filter ? { "service.serviceId": filter.serviceId } : { "service.attrId": filter.attrId };
  const [c, p, t] = await Promise.all([
    customerAttributes.find(q, { projection: { attribute: 1 } }).toArray(),
    positionAttributes.find(q, { projection: { attribute: 1 } }).toArray(),
    trxAttributes.find(q, { projection: { attribute: 1 } }).toArray(),
  ]);
  return [...c.map((a) => `Kundenattribut «${a.attribute}»`), ...p.map((a) => `Positionsattribut «${a.attribute}»`), ...t.map((a) => `Transaktionsattribut «${a.attribute}»`)];
}

/** A GET attribute changed its type / options: the attributes fed by it follow. */
export async function syncSourcedAttributes(attrId: ObjectId, attributeType: AttributeType, options: string[]) {
  const { customerAttributes, positionAttributes, trxAttributes } = await collections();
  const set = { $set: { attributeType, options, updatedAt: new Date() } };
  await Promise.all([
    customerAttributes.updateMany({ "service.attrId": attrId }, set),
    positionAttributes.updateMany({ "service.attrId": attrId }, set),
    trxAttributes.updateMany({ "service.attrId": attrId }, set),
  ]);
}
