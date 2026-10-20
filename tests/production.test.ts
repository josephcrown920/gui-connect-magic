import test from "node:test";
import assert from "node:assert/strict";
import {
  executeProduction,
  validatePlan,
  assembleScenes,
  productionRequestSchema,
  type ProductionRun,
} from "../src/lib/production.ts";
import { generateImage, generateVideo } from "../src/lib/generate.ts";

const scene = {
  id: "s1",
  title: "Opening",
  prompt: "City at dawn",
  narration: "A new beginning",
  duration: 4,
  source: "generate",
};
const plan = { title: "Launch", summary: "A cinematic launch", scenes: [scene] };
const media = { id: "asset1", name: "Shot", kind: "video" as const, dur: 6, url: "blob:shot" };

test("rejects invalid model output before generating paid media", () => {
  for (const value of [
    null,
    { ...plan, scenes: [] },
    { ...plan, scenes: [scene, scene] },
    { ...plan, scenes: [{ ...scene, duration: -3 }] },
    {
      ...plan,
      scenes: Array.from({ length: 10 }, (_, i) => ({ ...scene, id: `s${i}`, duration: 8 })),
    },
  ]) {
    assert.throws(() => validatePlan(value, []));
  }
});
test("existing scenes must reference real visual assets and fit the source", () => {
  const existing = { ...scene, source: "existing", assetId: "asset1" };
  assert.throws(() => validatePlan({ ...plan, scenes: [existing] }, []));
  assert.throws(() => validatePlan({ ...plan, scenes: [existing] }, [{ ...media, kind: "audio" }]));
  assert.throws(() => validatePlan({ ...plan, scenes: [{ ...existing, duration: 8 }] }, [media]));
  assert.equal(validatePlan({ ...plan, scenes: [existing] }, [media]).scenes[0]?.assetId, media.id);
});
test("assembly is contiguous and refuses partial productions", () => {
  const parsed = validatePlan(
    { ...plan, scenes: [scene, { ...scene, id: "s2", duration: 3 }] },
    [],
  );
  assert.throws(() => assembleScenes(parsed, { s1: media }));
  const result = assembleScenes(parsed, { s1: media, s2: { ...media, id: "asset2" } });
  assert.deepEqual(
    result.map((c) => [c.start, c.dur, c.track]),
    [
      [0, 4, "V1"],
      [4, 3, "V1"],
    ],
  );
  assert.equal(new Set(result.map((c) => c.id)).size, 2);
});
test("rejects excessive or blank briefs", () => {
  assert.equal(productionRequestSchema.safeParse({ brief: " ", assets: [] }).success, false);
  assert.equal(
    productionRequestSchema.safeParse({ brief: "x".repeat(6001), assets: [] }).success,
    false,
  );
});
test("generation surfaces provider errors instead of accepting an error as media", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { message: "No credits" } }, { status: 402 }),
  );
  await assert.rejects(generateImage("city", "sunburst"), /No credits/);
});
test("video resume uses the existing job, and polling failures stop immediately", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "setTimeout", (callback: () => void) => {
    queueMicrotask(callback);
    return 0;
  });
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    return Response.json({ error: "Job unavailable" }, { status: 503 });
  });
  await assert.rejects(
    generateVideo("city", "veo31fast", "", { jobId: "saved-job" }),
    /Job unavailable/,
  );
  assert.deepEqual(calls, ["/api/video/saved-job"]);
});
test("pause aborts polling without creating another video job", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({});
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    generateVideo("city", "veo31fast", "", { jobId: "saved-job", signal: controller.signal }),
  );
  assert.equal(requests, 0);
});

test("partial failures preserve checkpoints; resuming generates only unfinished scenes", async () => {
  const run: ProductionRun = {
    id: "run",
    brief: "launch",
    plan: validatePlan({ ...plan, scenes: [scene, { ...scene, id: "s2" }] }, []),
    sources: [],
    media: {},
    jobs: {},
    kind: "image",
    engine: "sunburst",
  };
  const persisted: string[] = [];
  const signal = new AbortController().signal;
  await assert.rejects(
    executeProduction(run, {
      signal,
      status() {},
      async generate(s) {
        if (s.id === "s2") throw new Error("provider down");
        return media;
      },
      async checkpoint(_run, asset) {
        persisted.push(asset.id);
      },
    }),
    /provider down/,
  );
  assert.deepEqual(Object.keys(run.media), ["s1"]);
  assert.deepEqual(persisted, ["asset1"]);
  const generated: string[] = [];
  const clips = await executeProduction(run, {
    signal,
    status() {},
    async generate(s) {
      generated.push(s.id);
      return { ...media, id: "asset2" };
    },
    async checkpoint() {},
  });
  assert.deepEqual(generated, ["s2"]);
  assert.deepEqual(
    clips.map((c) => c.start),
    [0, 4],
  );
});
test("reusing existing assets never calls generation", async () => {
  const run: ProductionRun = {
    id: "run",
    brief: "reuse",
    plan: validatePlan({ ...plan, scenes: [{ ...scene, source: "existing", assetId: media.id }] }, [
      media,
    ]),
    sources: [media],
    media: {},
    jobs: {},
    kind: "image",
    engine: "sunburst",
  };
  const result = await executeProduction(run, {
    signal: new AbortController().signal,
    status() {},
    async checkpoint() {},
    async generate() {
      throw new Error("must not generate");
    },
  });
  assert.equal(result[0]?.assetId, media.id);
});
test("pausing after a scene stops further spending and keeps the finished asset", async () => {
  const run: ProductionRun = {
    id: "run",
    brief: "launch",
    plan: validatePlan({ ...plan, scenes: [scene, { ...scene, id: "s2" }] }, []),
    sources: [],
    media: {},
    jobs: {},
    kind: "image",
    engine: "sunburst",
  };
  const controller = new AbortController();
  let generations = 0;
  await assert.rejects(
    executeProduction(run, {
      signal: controller.signal,
      status() {},
      async generate() {
        generations++;
        return media;
      },
      async checkpoint() {
        controller.abort();
      },
    }),
  );
  assert.equal(generations, 1);
  assert.deepEqual(Object.keys(run.media), ["s1"]);
});
