import "server-only";
import type { ObjectId } from "mongodb";
import type { DomainName } from "@/lib/domains";
import type { AttributeDef } from "@/lib/positions";
import type { AttributeKind } from "@/lib/typeAttributes";
import type { DomainValue, TypeAttribute } from "@/lib/types";
import { collections, type DomainValueDoc, type TypeAttributeDoc } from "./db";
import { HttpError } from "./http";

// Admin-managed value lists. Records store the value's `code`; the field
// that uses each domain is listed in USAGE (for in-use counts and the
// delete guard).

export const toDomainValue = (
  d: DomainValueDoc,
  usage?: number,
  attributeCounts?: DomainValue["attributeCounts"],
): DomainValue => ({
  id: d._id.toHexString(),
  domain: d.domain,
  code: d.code,
  label: d.label,
  active: d.active,
  sort: d.sort,
  ...(usage !== undefined && { usage }),
  ...(attributeCounts && { attributeCounts }),
});

/** Admin view of a value: with usage and (product/service types) attribute counts. */
export async function toAdminDomainValue(d: DomainValueDoc) {
  const c = await collections();
  if (d.domain !== "productServiceType") return toDomainValue(d, await domainUsage(d.domain, d.code));
  const [usage, position, trx] = await Promise.all([
    domainUsage(d.domain, d.code),
    c.positionAttributes.countDocuments({ typeId: d._id }),
    c.trxAttributes.countDocuments({ typeId: d._id }),
  ]);
  return toDomainValue(d, usage, { position, trx });
}

/** The collection of a relation: position or transaction attributes. */
export async function attributeCollection(kind: AttributeKind) {
  const c = await collections();
  return kind === "position" ? c.positionAttributes : c.trxAttributes;
}

/** Type attributes and customer attributes (typeId null) to the page. */
export const toTypeAttribute = (a: Omit<TypeAttributeDoc, "typeId"> & { typeId: TypeAttributeDoc["typeId"] | null }): TypeAttribute => ({
  id: a._id.toHexString(),
  ...(a.typeId && { typeId: a.typeId.toHexString() }),
  attribute: a.attribute,
  attributeType: a.attributeType,
  options: a.options,
  sort: a.sort,
});

/** The productServiceType value that owns attributes – 404 / 400 otherwise. */
export async function requireProductType(id: ObjectId) {
  const { domainValues } = await collections();
  const doc = await domainValues.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Typ nicht gefunden");
  if (doc.domain !== "productServiceType") throw new HttpError(400, "Attribute gibt es nur bei Produkt-/Dienstleistungstypen");
  return doc;
}

export async function typeAttributesOf(typeId: ObjectId, kind: AttributeKind) {
  return (await attributeCollection(kind)).find({ typeId }).sort({ sort: 1, attribute: 1 }).toArray();
}

/** Position or transaction attributes of all product/service types, by type code (for the forms). */
export async function attributesByType(types: DomainValueDoc[], kind: AttributeKind) {
  const col = await attributeCollection(kind);
  const codeOf = new Map(types.map((t) => [t._id.toHexString(), t.code]));
  const out: Record<string, AttributeDef[]> = {};
  for (const a of await col.find({ typeId: { $in: types.map((t) => t._id) } }).sort({ sort: 1, attribute: 1 }).toArray()) {
    const code = codeOf.get(a.typeId.toHexString())!;
    (out[code] ??= []).push({ id: a._id.toHexString(), attribute: a.attribute, attributeType: a.attributeType, options: a.options });
  }
  return out;
}

export async function domainValues(domain: DomainName) {
  const { domainValues } = await collections();
  return domainValues.find({ domain }).sort({ sort: 1, label: 1 }).toArray();
}

/** How many records use a value. */
export async function domainUsage(domain: DomainName, code: string) {
  const { customerProducts, customerPositions, customerComPrefs } = await collections();
  if (domain === "comPrefs") return customerComPrefs.countDocuments({ comPrefType: code });
  if (domain === "serviceType") return (await collections()).services.countDocuments({ serviceType: code });
  const [products, positions] = await Promise.all([
    customerProducts.countDocuments({ productServiceType: code }),
    customerPositions.countDocuments({ productServiceType: code }),
  ]);
  return products + positions;
}

/**
 * A record may only get an active value – or keep the one it already has
 * (so editing a record whose value was deactivated still works).
 */
export async function assertDomainValue(domain: DomainName, code: string, current?: string) {
  if (code === current) return;
  const { domainValues } = await collections();
  const value = await domainValues.findOne({ domain, code });
  if (!value || !value.active) throw new HttpError(400, `Unbekannter oder inaktiver Wert «${code}»`);
}
