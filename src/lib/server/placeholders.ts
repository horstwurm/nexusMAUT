import "server-only";
import { buildCatalog } from "@/lib/placeholders";
import { customerAttributeDefs } from "./customers";
import { collections } from "./db";
import { attributesByType, domainValues } from "./domains";

/** The placeholder catalog from the attributes currently defined in Admin. */
export async function placeholderCatalog() {
  const types = await domainValues("productServiceType");
  const { services, serviceGetAttributes } = await collections();
  const [customerAttributes, positionAttributes, trxAttributes, serviceList, getAttrs] = await Promise.all([
    customerAttributeDefs(),
    attributesByType(types, "position"),
    attributesByType(types, "trx"),
    services.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    serviceGetAttributes.find().sort({ sort: 1, attribute: 1 }).toArray(),
  ]);
  return buildCatalog({
    customerAttributes,
    types: types.map((t) => ({ code: t.code, label: t.label })),
    positionAttributes,
    trxAttributes,
    services: serviceList.map((s) => ({
      name: s.name,
      // values and lists (lists → block, count, sum, first row)
      getAttributes: getAttrs
        .filter((a) => a.serviceId.equals(s._id))
        .map((a) => ({ attribute: a.attribute, attributeType: a.attributeType, list: a.list ? { columns: a.list.columns } : null })),
    })),
  });
}
