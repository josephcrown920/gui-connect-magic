import test from "node:test";
import assert from "node:assert/strict";
import { chatTarget, chatCompletion, plannerModel } from "../src/lib/chat-provider.server.ts";
import { falVideoInput, FAL_VIDEOS, performanceInput } from "../src/lib/media-catalog.ts";
import { signJob, readJob, submitFal, falStatus } from "../src/lib/fal.server.ts";
import { authorizeStudio } from "../src/lib/studio-access.server.ts";
import { planProduction } from "../src/lib/production.server.ts";

function secret(t: { after: (fn: () => void) => void }, name: string, value?: string) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test("OpenRouter is preferred when configured; explicit provider selection does not fall back", (t) => {
  secret(t, "OPENROUTER_API_KEY", "test-router-key");
  secret(t, "LOVABLE_API_KEY", "test-lovable-key");
  assert.equal(chatTarget().provider, "OpenRouter");
  assert.equal(chatTarget("lovable").provider, "Lovable AI");
  delete process.env["OPENROUTER_API_KEY"];
  assert.throws(() => chatTarget("openrouter"), /OPENROUTER_API_KEY/);
  assert.equal(chatTarget().provider, "Lovable AI");
});
test("missing keys fail before contacting a provider", async (t) => {
  secret(t, "OPENROUTER_API_KEY");
  secret(t, "LOVABLE_API_KEY");
  secret(t, "FAL_KEY");
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("must not fetch");
  });
  assert.throws(() => chatTarget(), /Connect OpenRouter/);
  await assert.rejects(submitFal("bytedance/seedance-2.5/text-to-video", {}), /FAL_KEY/);
});
test("arbitrary planning models are rejected", () => {
  assert.equal(plannerModel("astra"), "openai/gpt-6-astra");
  assert.throws(() => plannerModel("unknown-model"), /supported/);
});
test("chat routing uses server authorization and the selected model", async (t) => {
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (url: string, opts: RequestInit) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal((opts.headers as Record<string, string>)["Authorization"], "Bearer test-only");
    body = JSON.parse(opts.body as string);
    return Response.json({ choices: [{ message: { content: '{"reply":"ready"}' } }] });
  });
  assert.equal(
    await chatCompletion(
      {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: "test-only",
        provider: "OpenRouter",
      },
      "qwen/qwen3.8-flash",
      [{ role: "user", content: "plan" }],
    ),
    '{"reply":"ready"}',
  );
  assert.equal(body["model"], "qwen/qwen3.8-flash");
  assert.equal(body["max_tokens"], 6000);
});
test("provider credits errors never trigger a second paid provider call", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({}, { status: 402 });
  });
  await assert.rejects(
    chatCompletion(
      {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: "test-only",
        provider: "OpenRouter",
      },
      "x",
      [],
    ),
    /out of credits/,
  );
  assert.equal(calls, 1);
});
test("director and reviewer both use the selected OpenRouter model", async (t) => {
  secret(t, "OPENROUTER_API_KEY", "test-only");
  const roles: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, opts: RequestInit) => {
    const request = JSON.parse(opts.body as string);
    assert.equal(request.model, "deepseek/deepseek-v4.1-flash");
    roles.push(request.messages[0].content);
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Launch",
              summary: "Draft",
              scenes: [
                {
                  id: "scene-1",
                  title: "Opening",
                  prompt: "A city",
                  narration: "Hello",
                  duration: 4,
                  source: "generate",
                },
              ],
            }),
          },
        },
      ],
    });
  });
  const output = await planProduction({
    brief: "Launch video",
    assets: [],
    planner: "deepseek",
    provider: "openrouter",
  });
  assert.equal(output.plan.scenes.length, 1);
  assert.equal(roles.length, 2);
  assert.match(roles[0]!, /director/);
  assert.match(roles[1]!, /reviewer/);
});
test("video mappings use the right endpoint and model-specific settings", () => {
  const seedance = falVideoInput("seedance", "city", 8);
  assert.equal(seedance.endpoint, "bytedance/seedance-2.5/text-to-video");
  assert.equal(seedance.input.duration, "8");
  const image = falVideoInput("seedance", "city", 8, "data:image/png;base64,test");
  assert.equal(image.endpoint, "bytedance/seedance-2.5/image-to-video");
  assert.equal(falVideoInput("ltx", "city", 8).input.resolution, "1080p");
  assert.equal(falVideoInput("minimax", "city", 8).input.prompt_expansion_mode, "balanced");
  assert.throws(() => falVideoInput("unknown", "city", 8));
  assert.throws(() => falVideoInput("seedance", "city", 100));
});
test("video job IDs are signed and tampered or arbitrary endpoints are rejected", async (t) => {
  secret(t, "FAL_KEY", "test-only-fal");
  const endpoint = FAL_VIDEOS["seedance"]!.text;
  const token = await signJob(endpoint, "job-123");
  assert.equal((await readJob(token)).id, "job-123");
  await assert.rejects(readJob(token.slice(0, -8) + "tampered"), /Invalid/);
  await assert.rejects(readJob(await signJob("attacker/arbitrary-model", "job-123")), /Invalid/);
});
test("nested fal jobs poll the correct queue namespace", async (t) => {
  secret(t, "FAL_KEY", "test-only-fal");
  const token = await signJob(FAL_VIDEOS["ltx"]!.text, "job-123");
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://queue.fal.run/fal-ai/ltx-2.3/requests/job-123/status");
    return Response.json({ status: "COMPLETED" });
  });
  assert.deepEqual(await falStatus(token), { status: "completed" });
});

test("paid APIs require a configured owner code and matching bearer credential", async (t) => {
  secret(t, "STUDIO_ACCESS_TOKEN");
  assert.equal(
    (await authorizeStudio(new Request("https://studio.example/api/image")))?.status,
    503,
  );
  process.env["STUDIO_ACCESS_TOKEN"] = "test-access-code-at-least-24-characters";
  assert.equal(
    (await authorizeStudio(new Request("https://studio.example/api/image")))?.status,
    401,
  );
  assert.equal(
    await authorizeStudio(
      new Request("https://studio.example/api/image", {
        headers: { Authorization: "Bearer test-access-code-at-least-24-characters" },
      }),
    ),
    null,
  );
});

test("performance tasks enforce their own required media", () => {
  assert.throws(() => performanceInput("omnihuman", "image", undefined, undefined), /audio/);
  assert.throws(() => performanceInput("motion", "image", undefined, undefined), /reference video/);
  assert.equal(performanceInput("omnihuman", "image", "audio", undefined).input.audio_url, "audio");
  assert.equal(
    performanceInput("motion", "image", undefined, "video").input.character_orientation,
    "video",
  );
});
