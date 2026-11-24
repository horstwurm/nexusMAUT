import { requireUser } from "@/lib/server/auth";
import { appUrl, HttpError, NO_STORE, parseId, route } from "@/lib/server/http";
import { assertSourceNameFree, planUpload, readSources, runUpload, sourceNameOf } from "@/lib/server/initialUpload";
import type { UploadResult } from "@/lib/types";

// POST /api/data-management/initial-upload – multipart form (admins):
//   files            one Excel / JSON file or the CSV files (Typen, Kunden, Positionen, Transaktionen)
//   mode             "test" (check only, writes nothing) | "upload"
//   deleteCustomers  "true": delete all customers with their positions, transactions, products,
//                    preferences and KundenJourneys first
//   deleteAttributes "true": delete the position / transaction attributes of the types in the file first
//   deleteUploads    repeated: ids of earlier uploads whose data (customers with all of theirs, their
//                    positions / transactions) is deleted first – ignored with deleteCustomers
//   sourceName       upload only: the upload's unique name (stored on every record; 409 if taken)
// → test: UploadResult (JSON). Upload: NDJSON stream – {"progress":n,"label":…} lines while it runs,
// then {"result": UploadResult} or {"error": message, "status": n}. Problems found before it starts
// (no admin, files, taken name) are plain JSON errors. An upload with errors writes nothing (done: false).
// Multipart instead of readJson: sameSite=lax cookies already keep cross-site posts out; the
// Origin check below makes it explicit.

export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const user = await requireUser("admin");
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl()).origin && origin !== new URL(req.url).origin) throw new HttpError(403, "Fremde Herkunft");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Erwarte ein Formular mit Dateien");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const opts = {
    deleteCustomers: form.get("deleteCustomers") === "true",
    deleteAttributes: form.get("deleteAttributes") === "true",
    deleteUploads: form.getAll("deleteUploads").map((v) => parseId(String(v))),
  };
  const upload = form.get("mode") === "upload";
  const name = upload ? sourceNameOf(form.get("sourceName")) : "";
  const src = await readSources(files);
  if (!upload) {
    const result: UploadResult = { ...(await planUpload(src, opts)).report, done: false, sourceName: null, created: null };
    return Response.json(result, { headers: NO_STORE });
  }
  await assertSourceNameFree(name);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      let last = -1;
      try {
        const result = await runUpload(src, opts, { name, userId: user._id }, (progress, label) => {
          if (progress === last) return;
          last = progress;
          line({ progress, label });
        });
        line({ result });
      } catch (err) {
        console.error("[upload]", err);
        line({ error: err instanceof HttpError ? err.message : "Interner Serverfehler beim Upload", status: err instanceof HttpError ? err.status : 500 });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", ...NO_STORE } });
});
