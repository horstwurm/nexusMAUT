import { requireUser } from "@/lib/server/auth";
import { listLog, LOG_PAGE_SIZE, logFilterOptions } from "@/lib/server/changeLog";
import { NO_STORE, route } from "@/lib/server/http";

// GET /api/logfile?area&user&action&from&to&q&limit – Logfile entries, newest first (admins);
// user=system for entries without a user. → { entries, more, options: { areas, users } }

export const GET = route(async (req: Request) => {
  await requireUser("admin");
  const p = new URL(req.url).searchParams;
  const get = (k: string) => p.get(k)?.trim() || undefined;
  const limit = Math.min(Math.max(Number(p.get("limit")) || LOG_PAGE_SIZE, 1), 2000);
  const [list, options] = await Promise.all([
    listLog({ area: get("area"), user: get("user"), action: get("action"), from: get("from"), to: get("to"), q: get("q") }, limit),
    logFilterOptions(),
  ]);
  return Response.json({ ...list, options }, { headers: NO_STORE });
});
