/** Client applications proxy from their server so shared-service keys never enter browsers. */
export async function proxyToShared(request: Request): Promise<Response | null> {
  const base = process.env["SHARED_AI_BASE_URL"];
  if (!base || process.env["SHARED_AI_SERVICE"] === "1") return null;
  const app = process.env["SHARED_AI_APP_ID"];
  const key = process.env["SHARED_AI_APP_KEY"];
  if (!app || !key)
    return Response.json(
      {
        error: {
          message:
            "Configure SHARED_AI_APP_ID and SHARED_AI_APP_KEY in this app's server settings.",
        },
      },
      { status: 503 },
    );
  try {
    const target = new URL(base);
    if (
      target.protocol !== "https:" &&
      !(
        process.env["NODE_ENV"] !== "production" &&
        ["localhost", "127.0.0.1"].includes(target.hostname)
      )
    )
      throw new Error("The shared backend URL must use HTTPS.");
    if (target.username || target.password || target.search || target.hash)
      throw new Error("Use a plain shared-backend base URL.");
    const source = new URL(request.url);
    target.pathname = `${target.pathname.replace(/\/$/, "")}/v1${source.pathname.replace(/^\/api/, "")}`;
    const headers = new Headers();
    if (request.headers.has("Content-Type"))
      headers.set("Content-Type", request.headers.get("Content-Type")!);
    headers.set("X-App-Id", app);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Idempotency-Key", request.headers.get("Idempotency-Key") ?? crypto.randomUUID());
    const response = await fetch(target, {
      method: request.method,
      headers,
      ...(!["GET", "HEAD"].includes(request.method) ? { body: await request.arrayBuffer() } : {}),
      signal: AbortSignal.timeout(330000),
      redirect: "error",
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          message:
            error instanceof Error && error.message.startsWith("The shared")
              ? error.message
              : "The shared AI backend could not be reached. Check the saved request before retrying a paid generation.",
        },
      },
      { status: 502 },
    );
  }
}
