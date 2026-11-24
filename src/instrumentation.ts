// Runs once when a server instance starts (Next.js instrumentation).
// Starts the background timer for the events' trigger services (Node.js runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEventTimer } = await import("./lib/server/eventTimer");
    startEventTimer();
  }
}
