// Copies every customer's age (from the birth date, as the rules compute it)
// into the customer attribute «Alter» (type Zahl).
//   npm run attributes:age
// Run again to refresh – a stored age goes stale on each birthday.
// Creates «Alter» if missing; an existing «Alter» of another type is changed
// to Zahl only while no customer has a value for it (otherwise: abort).
// Reads MONGODB_URI / MONGODB_DB from .env.local.
import { MongoClient, ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { ageOn } from "../src/lib/rules.ts";

const NAME = "Alter";
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "nexus-maut");
  const attrs = db.collection("customerAttributes");
  const customers = db.collection("customers");
  const now = new Date();

  // the attribute (name case-insensitive, like the unique index)
  let attr = await attrs.findOne({ attribute: NAME }, { collation: { locale: "de", strength: 2 } });
  if (!attr) {
    const last = await attrs.find().sort({ sort: -1 }).limit(1).next();
    const doc = { _id: new ObjectId(), attribute: NAME, attributeType: "num", options: [], sort: last ? last.sort + 10 : 10, createdAt: now, updatedAt: now };
    await attrs.insertOne(doc);
    attr = doc;
    console.log(`Created customer attribute «${NAME}» (Zahl).`);
  } else if (attr.attributeType !== "num") {
    const key = `attributes.${attr._id.toHexString()}`;
    const used = await customers.countDocuments({ [key]: { $exists: true } });
    if (used) {
      console.error(`«${attr.attribute}» has type ${attr.attributeType} and ${used} customers have values – not changed. Change or delete it in Admin first.`);
      process.exit(1);
    }
    await attrs.updateOne({ _id: attr._id }, { $set: { attributeType: "num", options: [], updatedAt: now } });
    console.log(`Changed «${attr.attribute}» from ${attr.attributeType} to Zahl (no values existed).`);
  }

  const key = `attributes.${attr._id.toHexString()}`;
  const today = now.toISOString().slice(0, 10);
  const ops: AnyBulkWriteOperation<Document>[] = [];
  for await (const c of customers.find({}, { projection: { dateOfBirth: 1 } })) {
    const age = ageOn((c.dateOfBirth as Date).toISOString().slice(0, 10), today);
    // updatedAt stays: this is derived data, not an edit
    ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: { [key]: age } } } });
  }
  if (ops.length) await customers.bulkWrite(ops, { ordered: false });
  console.log(`Set «${attr.attribute}» for ${ops.length} customers (ages as of ${today}).`);
} finally {
  await client.close();
}
