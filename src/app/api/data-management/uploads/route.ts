import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { NO_STORE, route } from "@/lib/server/http";
import type { UploadView } from "@/lib/types";

// GET /api/data-management/uploads – all uploads, newest first, with how many of their customers,
// positions and transactions are still there (admins; «Upload Daten löschen»).

export const GET = route(async () => {
  await requireUser("admin");
  const c = await collections();
  const uploads = await c.uploads.find().sort({ createdAt: -1 }).toArray();
  const names = uploads.map((u) => u.name);
  const countBy = async (col: typeof c.customers | typeof c.customerPositions | typeof c.positionTransactions) =>
    new Map(
      (await (col as typeof c.customers).aggregate<{ _id: string; n: number }>([{ $match: { uploadName: { $in: names } } }, { $group: { _id: "$uploadName", n: { $sum: 1 } } }]).toArray()).map(
        (r) => [r._id, r.n],
      ),
    );
  const [cust, pos, trx, users] = await Promise.all([
    countBy(c.customers),
    countBy(c.customerPositions),
    countBy(c.positionTransactions),
    c.users.find({ _id: { $in: [...new Set(uploads.map((u) => u.createdBy))] } }, { projection: { name: 1 } }).toArray(),
  ]);
  const userName = new Map(users.map((u) => [u._id, u.name]));
  const list: UploadView[] = uploads.map((u) => ({
    id: u._id.toHexString(),
    name: u.name,
    source: u.source,
    files: u.files,
    createdAt: u.createdAt.toISOString(),
    createdByName: userName.get(u.createdBy) ?? u.createdBy,
    counts: u.counts,
    current: { customers: cust.get(u.name) ?? 0, positions: pos.get(u.name) ?? 0, transactions: trx.get(u.name) ?? 0 },
    deletedAt: u.deletedAt?.toISOString() ?? null,
  }));
  return Response.json(list, { headers: NO_STORE });
});
