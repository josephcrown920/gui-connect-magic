import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("standalone process serves health, authenticates clients and routes LTX without provider secrets", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "shared-ai-http-"));
  const token = "test-http-client-not-a-real-secret";
  const child = spawn(process.execPath, ["--experimental-strip-types", "shared-ai/src/server.ts"], {
    cwd: new URL("../..", import.meta.url),
    env: {
      ...process.env,
      PORT: "0",
      SHARED_AI_DATABASE: join(directory, "jobs.sqlite"),
      SHARED_AI_APPS_JSON: JSON.stringify({
        reel: { keyHash: createHash("sha256").update(token).digest("hex"), allowedModels: ["ltx"] },
      }),
      FAL_KEY: "",
      OPENROUTER_API_KEY: "",
      LOVABLE_API_KEY: "",
      SHARED_AI_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    rmSync(directory, { recursive: true, force: true });
  });
  const port = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 10000);
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/listening on (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited: ${code}`));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/v1/models`)).status, 401);
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-App-Id": "reel",
    "Content-Type": "application/json",
    "Idempotency-Key": "http-request-1",
  };
  const models = (await (await fetch(`${base}/v1/models`, { headers })).json()) as {
    videos: { id: string }[];
  };
  assert.deepEqual(
    models.videos.map((v) => v.id),
    ["ltx"],
  );
  const result = await fetch(`${base}/v1/video`, {
    method: "POST",
    headers,
    body: JSON.stringify({ engine: "ltx", prompt: "city", duration: "8s" }),
  });
  assert.equal(result.status, 502);
  assert.match(await result.text(), /FAL_KEY/);
  assert.equal((await fetch(`${base}/v1/requests/http-request-1`, { headers })).status, 502);
});
