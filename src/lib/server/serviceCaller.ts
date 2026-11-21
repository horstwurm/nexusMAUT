import "server-only";
import type { PositionValue } from "@/lib/positions";
import { buildRequest, isUnavailable, mapResponse, mockResponse, type CallMethod, type MappedValue, type ServiceAttrDef } from "@/lib/serviceCall";
import type { AttributeDef } from "@/lib/positions";

// Calls a service over HTTP (server side: no CORS, the URL stays here):
// 10 s timeout, the response read up to 1 MB. Never throws for service
// problems – the result says what happened; when the service isn't
// available (no answer, 404, 5xx) `mock` holds the expected answer with
// sample data. Used by Admin «Testen» and the journey step test.

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;
const RAW_SHOWN = 20_000;

export type CallResult = {
  request: ReturnType<typeof buildRequest>;
  response: { status: number; ok: boolean; durationMs: number; contentType: string | null; raw: string; truncated: boolean } | null;
  error: string | null;
  mapped: MappedValue[] | null;
  mock?: { response: Record<string, unknown>; mapped: MappedValue[] };
};

export async function callService(
  url: string,
  method: CallMethod,
  putDefs: AttributeDef[],
  getDefs: ServiceAttrDef[],
  values: Record<string, PositionValue>,
): Promise<CallResult> {
  const request = buildRequest(url, method, putDefs, values);
  /** expected answer with sample values, mapped like a real one */
  const sample = () => {
    const response = mockResponse(getDefs);
    return { response, mapped: mapResponse(getDefs, response).values };
  };
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(request.url, {
      method,
      headers: { Accept: "application/json", ...(request.body !== null && { "Content-Type": "application/json" }) },
      body: request.body ?? undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err);
    return {
      request,
      response: null,
      error: timeout ? `Keine Antwort innert ${TIMEOUT_MS / 1000} s` : `Service nicht erreichbar: ${cause}`,
      mapped: null,
      mock: sample(),
    };
  }

  // read at most MAX_BYTES
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // not JSON – reported below
  }
  const mapped = json === undefined ? null : mapResponse(getDefs, json);
  return {
    request,
    response: {
      status: res.status,
      ok: res.ok,
      durationMs: Date.now() - started,
      contentType: res.headers.get("content-type"),
      raw: text.slice(0, RAW_SHOWN),
      truncated: truncated || text.length > RAW_SHOWN,
    },
    error: json === undefined ? (truncated ? "Antwort grösser als 1 MB" : "Antwort ist kein JSON") : (mapped?.error ?? null),
    mapped: mapped?.values ?? null,
    ...(isUnavailable(res.status) && { mock: sample() }),
  };
}
