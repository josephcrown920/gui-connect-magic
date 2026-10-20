import test from "node:test";
import assert from "node:assert/strict";
import { handleAgent } from "../src/lib/api/agent.server.ts";
import { chatTarget, plannerModel } from "../src/lib/chat-provider.server.ts";
import { productionRequestSchema } from "../src/lib/production.ts";
import { OLLAMA_MODELS } from "../src/lib/ollama-models.ts";

const code = "test-owner-code-longer-than-24-characters";
function setup(t: { after: (fn: () => void) => void }) {
  const names = [
    "STUDIO_ACCESS_TOKEN",
    "SHARED_AI_BASE_URL",
    "OLLAMA_BASE_URL",
    "OLLAMA_API_KEY",
    "OPENROUTER_API_KEY",
  ];
  const saved = names.map((n) => process.env[n]);
  for (const n of names) delete process.env[n];
  process.env.STUDIO_ACCESS_TOKEN = code;
  process.env.OPENROUTER_API_KEY = "must-not-use-this-provider";
  t.after(() =>
    names.forEach((n, i) => {
      if (saved[i] === undefined) delete process.env[n];
      else process.env[n] = saved[i];
    }),
  );
}
function request(agent: string, kind: "image" | "video" = "image") {
  return new Request("http://studio/api/agent", {
    method: "POST",
    headers: { Authorization: `Bearer ${code}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent,
      brief: "Describe this",
      assets: [],
      clips: [],
      attachments: [
        {
          name: "sample",
          kind,
          mime: kind === "image" ? "image/png" : "video/mp4",
          data: "aGVsbG8=",
        },
      ],
    }),
  });
}
test("Qwen image input reaches Ollama even when OpenRouter is configured", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "http://127.0.0.1:11434/v1/chat/completions");
    assert.equal(new Headers(init.headers).has("Authorization"), false);
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, "qwen3-vl:2b");
    assert.equal(body.messages.at(-1).content[1].image_url.url, "data:image/png;base64,aGVsbG8=");
    return Response.json({
      choices: [{ message: { content: '{"reply":"Image inspected","steps":[],"actions":[]}' } }],
    });
  });
  const response = await handleAgent(request("qwen-vl-2b"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reply, "Image inspected");
});
test("Ollama video and text-only model images fail before contacting a provider", async (t) => {
  setup(t);
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("must not call");
  });
  assert.equal((await handleAgent(request("qwen-vl-2b", "video"))).status, 400);
  assert.equal((await handleAgent(request("nemotron-nano"))).status, 400);
});
test("all Ollama models are valid directors; remote connections require HTTPS", (t) => {
  setup(t);
  for (const m of OLLAMA_MODELS) {
    assert.equal(plannerModel(m.id), m.model);
    assert.equal(
      productionRequestSchema.parse({ brief: "Test", planner: m.id, assets: [] }).planner,
      m.id,
    );
  }
  process.env.OLLAMA_BASE_URL = "http://example.com";
  assert.throws(() => chatTarget("ollama"), /HTTPS/);
});
test("Ollama errors never trigger a paid-provider fallback", async (t) => {
  setup(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("Model unavailable", { status: 404 });
  });
  const response = await handleAgent(request("qwen-vl-2b"));
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
});
