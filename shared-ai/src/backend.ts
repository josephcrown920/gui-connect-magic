import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { handleAgent, providerReadiness } from "../../src/lib/api/agent.server.ts";
import { handleImage } from "../../src/lib/api/image.server.ts";
import { handleVideo } from "../../src/lib/api/video.server.ts";
import { handleVideoStatus } from "../../src/lib/api/video-status.server.ts";
import { handleVideoContent } from "../../src/lib/api/video-content.server.ts";
import { IMAGE_ENGINES, VIDEO_ENGINES } from "../../src/lib/engines.ts";
import { AGENTS } from "../../src/lib/agents.ts";

export type AppConfig = {
  keyHash: string;
  allowedModels: string[];
  requestsPerMinute: number;
  dailyStarts: number;
  concurrent: number;
};
export type Handlers = {
  agent: typeof handleAgent;
  image: typeof handleImage;
  video: typeof handleVideo;
  status: typeof handleVideoStatus;
  content: typeof handleVideoContent;
};
export const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");
export function parseApps(raw: string): Record<string, AppConfig> {
  const value = JSON.parse(raw) as Record<string, Partial<AppConfig>>;
  if (!value || Array.isArray(value) || typeof value !== "object" || !Object.keys(value).length)
    throw new Error("Configure at least one application in SHARED_AI_APPS_JSON.");
  const apps: Record<string, AppConfig> = Object.create(null);
  for (const [id, app] of Object.entries(value)) {
    if (
      !/^[a-zA-Z0-9_-]{1,60}$/.test(id) ||
      !app ||
      !/^[a-f0-9]{64}$/.test(app.keyHash ?? "") ||
      !Array.isArray(app.allowedModels) ||
      !app.allowedModels.length ||
      !app.allowedModels.every((x) => typeof x === "string")
    )
      throw new Error("Invalid application configuration.");
    const config = {
      keyHash: app.keyHash!,
      allowedModels: app.allowedModels,
      requestsPerMinute: app.requestsPerMinute ?? 30,
      dailyStarts: app.dailyStarts ?? 50,
      concurrent: app.concurrent ?? 2,
    };
    if (
      ![config.requestsPerMinute, config.dailyStarts, config.concurrent].every(
        (x) => Number.isInteger(x) && x >= 1 && x <= 10000,
      )
    )
      throw new Error("Invalid application limits.");
    apps[id] = config;
  }
  return apps;
}
const jsonError = (message: string, status: number) =>
  Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
const hashBytes = (text: string) => Buffer.from(keyHash(text), "hex");
type Cached = { bodyHash: string; status: number; body: string; type: string };

export function createSharedBackend(options: {
  database: string;
  applications: Record<string, AppConfig>;
  handlers?: Handlers;
}) {
  const db = new DatabaseSync(options.database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS limits (app TEXT, bucket TEXT, count INTEGER NOT NULL, PRIMARY KEY(app,bucket));
    CREATE TABLE IF NOT EXISTS jobs (app TEXT, tokenHash TEXT, created INTEGER, PRIMARY KEY(app,tokenHash));
    CREATE TABLE IF NOT EXISTS requests (app TEXT, key TEXT, bodyHash TEXT, status INTEGER, body TEXT, type TEXT, expires INTEGER, PRIMARY KEY(app,key));`);
  db.prepare("UPDATE requests SET status=503,body=? WHERE status=0").run(
    JSON.stringify({
      error: {
        message:
          "Service restarted during this request. The provider may still be running; inspect its dashboard before creating another paid request.",
      },
    }),
  );
  const handlers = options.handlers ?? {
    agent: handleAgent,
    image: handleImage,
    video: handleVideo,
    status: handleVideoStatus,
    content: handleVideoContent,
  };
  const active = new Map<string, number>();
  // Only the service knows this internal handler credential. Clients use independent app keys.
  const configuredCode = process.env["STUDIO_ACCESS_TOKEN"] ?? "";
  const internalCode =
    configuredCode.length >= 24 ? configuredCode : randomBytes(32).toString("hex");
  process.env["STUDIO_ACCESS_TOKEN"] = internalCode;
  process.env["SHARED_AI_SERVICE"] = "1";
  function cachedResponse(row: Cached) {
    return new Response(row.body, {
      status: row.status,
      headers: {
        "Content-Type": row.type,
        "Idempotency-Replayed": "true",
        "Cache-Control": "no-store",
      },
    });
  }
  function authenticated(headers: Headers) {
    const appId = headers.get("X-App-Id") ?? "";
    const app = Object.hasOwn(options.applications, appId)
      ? options.applications[appId]!
      : undefined;
    const token = headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
    return Boolean(app && timingSafeEqual(Buffer.from(app.keyHash, "hex"), hashBytes(token)));
  }
  async function fetchRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET")
      return Response.json({ status: "ok", service: "shared-ai", version: 1 });
    if (request.method === "OPTIONS")
      return jsonError("Call this API from your app's server, not directly from a browser.", 405);
    const appId = request.headers.get("X-App-Id") ?? "";
    const app = Object.hasOwn(options.applications, appId)
      ? options.applications[appId]!
      : undefined;
    if (!app || !authenticated(request.headers))
      return jsonError("Invalid application credentials.", 401);

    const now = Date.now();
    const minute = `minute:${Math.floor(now / 60000)}`;
    const increment = db.prepare(
      "INSERT INTO limits(app,bucket,count) VALUES(?,?,1) ON CONFLICT(app,bucket) DO UPDATE SET count=count+1 RETURNING count",
    );
    const minuteRow = increment.get(appId, minute) as { count: number };
    if (minuteRow.count > app.requestsPerMinute)
      return jsonError("Application request limit reached. Retry next minute.", 429);
    db.prepare("DELETE FROM requests WHERE expires < ?").run(now);
    // Quota windows only need to survive for their current day/minute.
    db.prepare("DELETE FROM limits WHERE bucket LIKE 'minute:%' AND bucket <> ?").run(minute);
    const day = `day:${new Date(now).toISOString().slice(0, 10)}`;
    db.prepare("DELETE FROM limits WHERE bucket LIKE 'day:%' AND bucket <> ?").run(day);
    const allowed = (id: string) =>
      app.allowedModels.includes("*") || app.allowedModels.includes(id);
    if ((url.pathname === "/v1/models" || url.pathname === "/v1/agent") && request.method === "GET")
      return Response.json(
        {
          ...providerReadiness(),
          images: IMAGE_ENGINES.filter((m) => allowed(m.id)),
          videos: VIDEO_ENGINES.filter((m) => allowed(m.id)),
          agents: AGENTS.filter((m) => allowed(m.id)),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (url.pathname.startsWith("/v1/requests/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/v1/requests/".length));
      const row = db.prepare("SELECT * FROM requests WHERE app=? AND key=?").get(appId, id) as
        Cached | undefined;
      return !row
        ? jsonError("Request not found.", 404)
        : row.status === 0
          ? Response.json({ status: "pending" }, { status: 202 })
          : cachedResponse(row);
    }
    const jobMatch = url.pathname.match(/^\/v1\/video\/([^/]+)(\/content)?$/);
    if (jobMatch && request.method === "GET") {
      const id = decodeURIComponent(jobMatch[1]!);
      if (!db.prepare("SELECT 1 FROM jobs WHERE app=? AND tokenHash=?").get(appId, keyHash(id)))
        return jsonError("Video job not found for this application.", 404);
      const headers = new Headers({ Authorization: `Bearer ${internalCode}` });
      const internal = new Request(request.url, { headers });
      return jobMatch[2] ? handlers.content(internal, id) : handlers.status(internal, id);
    }
    const kind =
      url.pathname === "/v1/agent"
        ? "agent"
        : url.pathname === "/v1/image"
          ? "image"
          : url.pathname === "/v1/video"
            ? "video"
            : null;
    if (!kind || request.method !== "POST") return jsonError("Unknown endpoint or method.", 404);
    const length = Number(request.headers.get("Content-Length") ?? 0);
    if (length > 42 * 1024 * 1024) return jsonError("Request is too large.", 413);
    const rawBytes = Buffer.from(await request.arrayBuffer());
    const raw = rawBytes.toString("utf8");
    if (rawBytes.length > 42 * 1024 * 1024) return jsonError("Request is too large.", 413);
    let model: string;
    try {
      if ((request.headers.get("Content-Type") ?? "").includes("multipart/form-data")) {
        if (kind !== "image")
          return jsonError("Multipart uploads are only supported for images.", 400);
        const form = await new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: rawBytes,
        }).formData();
        model = String(form.get("engine") ?? "sunburst");
      } else {
        const body = JSON.parse(raw) as Record<string, unknown>;
        if (!body || Array.isArray(body) || typeof body !== "object")
          return jsonError("Invalid request body.", 400);
        model = String(
          kind === "agent"
            ? body["operation"] === "production"
              ? (body["planner"] ?? "astra")
              : (body["agent"] ?? "astra")
            : (body["engine"] ?? (kind === "image" ? "sunburst" : "seedance")),
        );
      }
    } catch {
      return jsonError("Invalid request body.", 400);
    }
    if (!allowed(model))
      return jsonError("This application is not allowed to use the selected model.", 403);
    const idem = request.headers.get("Idempotency-Key") ?? "";
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(idem))
      return jsonError(
        "Supply an Idempotency-Key (8–120 letters, digits, hyphens or underscores).",
        400,
      );
    const bodyHash = createHash("sha256").update(kind).update(rawBytes).digest("hex");
    const existing = db.prepare("SELECT * FROM requests WHERE app=? AND key=?").get(appId, idem) as
      Cached | undefined;
    if (existing) {
      if (existing.bodyHash !== bodyHash)
        return jsonError("Idempotency key was already used for a different request.", 409);
      return existing.status === 0
        ? jsonError("This request is pending. Check /v1/requests/<key> before retrying.", 409)
        : cachedResponse(existing);
    }
    if ((active.get(appId) ?? 0) >= app.concurrent)
      return jsonError("This application already has the maximum concurrent requests.", 429);
    const used = db.prepare("SELECT count FROM limits WHERE app=? AND bucket=?").get(appId, day) as
      { count: number } | undefined;
    if ((used?.count ?? 0) >= app.dailyStarts)
      return jsonError("Application daily AI-start limit reached.", 429);
    increment.get(appId, day);
    db.prepare(
      "INSERT INTO requests(app,key,bodyHash,status,body,type,expires) VALUES(?,?,?,0,'','application/json',?)",
    ).run(appId, idem, bodyHash, now + 86400000);
    active.set(appId, (active.get(appId) ?? 0) + 1);
    try {
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${internalCode}`);
      const internal = new Request(request.url, { method: "POST", headers, body: rawBytes });
      // Do not cancel provider submissions if the client disconnects: preserve the result for recovery.
      const response = await handlers[kind](internal);
      const body = await response.text();
      if (response.ok && kind === "video") {
        const result = JSON.parse(body) as { id?: string };
        if (result.id)
          db.prepare("INSERT OR IGNORE INTO jobs(app,tokenHash,created) VALUES(?,?,?)").run(
            appId,
            keyHash(result.id),
            now,
          );
      }
      if (Buffer.byteLength(body) > 8 * 1024 * 1024)
        throw new Error("Response exceeds recovery storage limit.");
      const type = response.headers.get("Content-Type") ?? "application/json";
      db.prepare("UPDATE requests SET status=?,body=?,type=? WHERE app=? AND key=?").run(
        response.status,
        body,
        type,
        appId,
        idem,
      );
      return new Response(body, {
        status: response.status,
        headers: { "Content-Type": type, "Cache-Control": "no-store" },
      });
    } catch {
      const message = JSON.stringify({
        error: {
          message: "AI request failed. Check the saved request before creating another paid job.",
        },
      });
      db.prepare("UPDATE requests SET status=502,body=? WHERE app=? AND key=?").run(
        message,
        appId,
        idem,
      );
      return new Response(message, {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      active.set(appId, Math.max(0, (active.get(appId) ?? 1) - 1));
    }
  }
  return { fetch: fetchRequest, authenticated, close: () => db.close() };
}
