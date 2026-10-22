import test from "node:test";
import assert from "node:assert/strict";
import { proxyToShared } from "../src/lib/shared-proxy.server.ts";
function env(t: { after: (fn: () => void) => void }, name: string, value?: string) {
  const old = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (old === undefined) delete process.env[name];
    else process.env[name] = old;
  });
}
test("local mode remains available when no shared backend is configured", async (t) => {
  env(t, "SHARED_AI_BASE_URL");
  assert.equal(await proxyToShared(new Request("https://studio.example/api/agent")), null);
});
test("shared mode sends only server-held app credentials and preserves idempotency", async (t) => {
  env(t, "SHARED_AI_SERVICE");
  env(t, "SHARED_AI_BASE_URL", "https://backend.example");
  env(t, "SHARED_AI_APP_ID", "reel");
  env(t, "SHARED_AI_APP_KEY", "test-backend-key");
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.href, "https://backend.example/v1/video");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-backend-key");
    assert.equal(headers.get("X-App-Id"), "reel");
    assert.equal(headers.get("Idempotency-Key"), "retry-same-id");
    assert.equal(new TextDecoder().decode(options.body as ArrayBuffer), '{"engine":"ltx"}');
    return Response.json({ id: "job-1" });
  });
  const response = await proxyToShared(
    new Request("https://studio.example/api/video", {
      method: "POST",
      body: '{"engine":"ltx"}',
      headers: {
        Authorization: "Bearer owner-code-not-forwarded",
        "Content-Type": "application/json",
        "Idempotency-Key": "retry-same-id",
      },
    }),
  );
  assert.deepEqual(await response?.json(), { id: "job-1" });
});
test("missing client credentials fail closed and shared-service handlers never recurse", async (t) => {
  env(t, "SHARED_AI_BASE_URL", "https://backend.example");
  env(t, "SHARED_AI_APP_KEY");
  env(t, "SHARED_AI_SERVICE");
  assert.equal((await proxyToShared(new Request("https://studio.example/api/video")))?.status, 503);
  process.env["SHARED_AI_SERVICE"] = "1";
  assert.equal(await proxyToShared(new Request("https://studio.example/api/video")), null);
});
