import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSharedBackend,
  keyHash,
  parseApps,
  type AppConfig,
  type Handlers,
} from "../src/backend.ts";

const tokenA = "test-application-a-not-a-real-secret";
const tokenB = "test-application-b-not-a-real-secret";
const app = (token: string, changes: Partial<AppConfig> = {}): AppConfig => ({
  keyHash: keyHash(token),
  allowedModels: ["*"],
  requestsPerMinute: 100,
  dailyStarts: 20,
  concurrent: 2,
  ...changes,
});
const response = async () => Response.json({ reply: "ready" });
function handlers(changes: Partial<Handlers> = {}): Handlers {
  return {
    agent: response,
    image: response,
    video: async () => Response.json({ id: "test-job-1", status: "queued" }),
    status: async () => Response.json({ status: "completed" }),
    content: async () => new Response("video", { headers: { "Content-Type": "video/mp4" } }),
    ...changes,
  };
}
function request(
  path: string,
  body?: unknown,
  id = "request-0001",
  appId = "reel",
  token = tokenA,
) {
  return new Request(`https://backend.example${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-App-Id": appId,
      "Idempotency-Key": id,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("configuration fails closed on missing clients, invalid hashes or limits", () => {
  assert.throws(() => parseApps("{}"));
  assert.throws(() =>
    parseApps(JSON.stringify({ reel: { keyHash: "plaintext", allowedModels: ["*"] } })),
  );
  assert.throws(() => parseApps(JSON.stringify({ reel: app(tokenA, { concurrent: 0 }) })));
  assert.equal(parseApps(JSON.stringify({ reel: app(tokenA) }))["reel"]?.dailyStarts, 20);
});
test("health is public; credentials are required for all model operations", async (t) => {
  const api = createSharedBackend({
    database: ":memory:",
    applications: { reel: app(tokenA) },
    handlers: handlers(),
  });
  t.after(api.close);
  assert.equal((await api.fetch(new Request("https://backend.example/health"))).status, 200);
  assert.equal(
    (await api.fetch(request("/v1/models", undefined, "x", "reel", "wrong"))).status,
    401,
  );
  assert.equal((await api.fetch(request("/v1/models"))).status, 200);
});
test("model permissions are enforced before any provider call", async (t) => {
  let calls = 0;
  const api = createSharedBackend({
    database: ":memory:",
    applications: { reel: app(tokenA, { allowedModels: ["ltx"] }) },
    handlers: handlers({
      video: async () => {
        calls++;
        return Response.json({ id: "test" });
      },
    }),
  });
  t.after(api.close);
  assert.equal(
    (await api.fetch(request("/v1/video", { engine: "seedance", prompt: "city" }))).status,
    403,
  );
  assert.equal(calls, 0);
  const catalog = (await (await api.fetch(request("/v1/models"))).json()) as {
    videos: { id: string }[];
  };
  assert.deepEqual(
    catalog.videos.map((v) => v.id),
    ["ltx"],
  );
});
test("idempotent retries return saved results and do not make a second paid call", async (t) => {
  let calls = 0;
  const api = createSharedBackend({
    database: ":memory:",
    applications: { reel: app(tokenA) },
    handlers: handlers({
      video: async () => {
        calls++;
        return Response.json({ id: "job-a" });
      },
    }),
  });
  t.after(api.close);
  const body = { engine: "ltx", prompt: "city" };
  assert.equal((await api.fetch(request("/v1/video", body))).status, 200);
  const replay = await api.fetch(request("/v1/video", body));
  assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
  assert.equal(calls, 1);
  assert.equal(
    (await api.fetch(request("/v1/video", { ...body, prompt: "different" }))).status,
    409,
  );
  assert.equal((await api.fetch(request("/v1/requests/request-0001"))).status, 200);
});
test("job ownership and saved results persist across service restarts", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "shared-ai-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, "state.sqlite");
  const applications = { reel: app(tokenA), other: app(tokenB) };
  let api = createSharedBackend({ database, applications, handlers: handlers() });
  await api.fetch(request("/v1/video", { engine: "ltx" }));
  api.close();
  api = createSharedBackend({ database, applications, handlers: handlers() });
  t.after(() => api.close());
  assert.equal((await api.fetch(request("/v1/video/test-job-1"))).status, 200);
  assert.equal(
    (await api.fetch(request("/v1/video/test-job-1", undefined, "status-1", "other", tokenB)))
      .status,
    404,
  );
  assert.equal(
    (await api.fetch(request("/v1/requests/request-0001", undefined, "get-0001", "other", tokenB)))
      .status,
    404,
  );
  assert.equal((await api.fetch(request("/v1/requests/request-0001"))).status, 200);
});
test("daily start limits stop new spending but still allow job retrieval", async (t) => {
  const api = createSharedBackend({
    database: ":memory:",
    applications: { reel: app(tokenA, { dailyStarts: 1 }) },
    handlers: handlers(),
  });
  t.after(api.close);
  assert.equal((await api.fetch(request("/v1/video", { engine: "ltx" }))).status, 200);
  assert.equal(
    (await api.fetch(request("/v1/video", { engine: "ltx" }, "request-0002"))).status,
    429,
  );
  assert.equal((await api.fetch(request("/v1/video/test-job-1"))).status, 200);
});
test("concurrent requests and duplicate in-flight submissions are bounded", async (t) => {
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const api = createSharedBackend({
    database: ":memory:",
    applications: { reel: app(tokenA, { concurrent: 1 }) },
    handlers: handlers({
      video: async () => {
        await waiting;
        return Response.json({ id: "job-a" });
      },
    }),
  });
  t.after(api.close);
  const first = api.fetch(request("/v1/video", { engine: "ltx" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await api.fetch(request("/v1/video", { engine: "ltx" }))).status, 409);
  assert.equal(
    (await api.fetch(request("/v1/video", { engine: "ltx" }, "request-0002"))).status,
    429,
  );
  finish();
  assert.equal((await first).status, 200);
});
test("multipart image bytes survive authentication and routing unchanged", async (t) => {
  const binary = new Uint8Array([255, 0, 128, 254, 1]);
  const api = createSharedBackend({
    database: ":memory:",
    applications: { reel: app(tokenA) },
    handlers: handlers({
      image: async (req) => {
        const form = await req.formData();
        const file = form.get("image") as File;
        assert.deepEqual(new Uint8Array(await file.arrayBuffer()), binary);
        return Response.json({ data: [{ url: "https://example.com/image.png" }] });
      },
    }),
  });
  t.after(api.close);
  const form = new FormData();
  form.set("engine", "sunburst");
  form.set("prompt", "edit");
  form.set("image", new Blob([binary], { type: "image/png" }), "test.png");
  const req = new Request("https://backend.example/v1/image", {
    method: "POST",
    body: form,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "X-App-Id": "reel",
      "Idempotency-Key": "request-0001",
    },
  });
  assert.equal((await api.fetch(req)).status, 200);
});
