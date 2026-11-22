// Makes a user an admin of nexusMAUT (normally the first one to log in
// becomes admin automatically; this is the fallback).
//   npm run admin:grant -- someone@example.ch
// The person must have logged in (or registered) once. Reads MONGODB_URI / MONGODB_DB from .env.local.
import { MongoClient } from "mongodb";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:grant -- <email>");
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
try {
  await client.connect();
  const users = client.db(process.env.MONGODB_DB ?? "nexus-maut").collection("users");
  const res = await users.updateOne({ email }, { $set: { role: "admin" } });
  if (!res.matchedCount) {
    console.error(`No user ${email} – log in (or register) once first.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} is now an admin of nexusMAUT.`);
  }
} finally {
  await client.close();
}
