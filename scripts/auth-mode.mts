// Switches how people log in to nexusMAUT – the fallback when nobody can log in
// to change it in Admin → Anmeldung any more.
//   npm run auth:mode -- nexusIdentity     (login via nexusIdentity)
//   npm run auth:mode -- local             (own login: e-mail + password)
// Reads MONGODB_URI / MONGODB_DB from .env.local.
import { MongoClient } from "mongodb";

const mode = process.argv[2]?.trim();
if (mode !== "nexusIdentity" && mode !== "local") {
  console.error("Usage: npm run auth:mode -- nexusIdentity|local");
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
try {
  await client.connect();
  const settings = client.db(process.env.MONGODB_DB ?? "nexus-maut").collection<{ _id: string }>("settings");
  await settings.updateOne(
    { _id: "auth" },
    { $set: { mode, updatedAt: new Date(), updatedBy: "script" }, $setOnInsert: { allowRegistration: true } },
    { upsert: true },
  );
  console.log(`nexusMAUT login: ${mode === "local" ? "own login (e-mail + password)" : "nexusIdentity"}.`);
} finally {
  await client.close();
}
