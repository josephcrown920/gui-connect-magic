import test from "node:test";
import assert from "node:assert/strict";
import { attachmentsSchema, multimodalContent } from "../src/lib/multimodal.ts";
import { chatCompletion } from "../src/lib/chat-provider.server.ts";
import { attachMedia } from "../src/lib/attach-media.ts";

const image = {
  name: "shot.png",
  kind: "image" as const,
  mime: "image/png" as const,
  data: "aGVsbG8=",
};
const video = {
  name: "shot.mp4",
  kind: "video" as const,
  mime: "video/mp4" as const,
  data: "aGVsbG8=",
};
test("text-only prompts remain plain text", () => {
  assert.equal(multimodalContent("Explain pacing", []), "Explain pacing");
});
test("images and videos are sent as distinct native content parts", () => {
  assert.deepEqual(multimodalContent("Inspect these", [image, video]), [
    { type: "text", text: "Inspect these" },
    { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
    { type: "video_url", video_url: { url: "data:video/mp4;base64,aGVsbG8=" } },
  ]);
});
test("invalid media types, remote URL payloads and oversized attachments are rejected", () => {
  assert.equal(attachmentsSchema.safeParse([{ ...image, mime: "text/html" }]).success, false);
  assert.equal(attachmentsSchema.safeParse([{ ...image, kind: "video" }]).success, false);
  assert.equal(
    attachmentsSchema.safeParse([{ ...image, data: "https://internal.invalid/" }]).success,
    false,
  );
  assert.equal(attachmentsSchema.safeParse([image, image, image, image]).success, false);
  assert.equal(
    attachmentsSchema.safeParse([{ ...video, data: "a".repeat(28 * 1024 * 1024 + 1) }]).success,
    false,
  );
});
test("multimodal parts survive the actual OpenRouter request serialization", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    assert.equal(body.model, "qwen/qwen3.8-omni-flash");
    assert.equal(body.messages[0].content[1].type, "video_url");
    assert.equal(body.messages[0].content[1].video_url.url, "data:video/mp4;base64,aGVsbG8=");
    return Response.json({ choices: [{ message: { content: '{"reply":"A moving subject"}' } }] });
  });
  await chatCompletion(
    { provider: "OpenRouter", key: "test", url: "https://openrouter.ai/api/v1/chat/completions" },
    "qwen/qwen3.8-omni-flash",
    [{ role: "user", content: multimodalContent("Describe movement", [video]) }],
  );
});
test("private blob media is encoded as bytes instead of sending its browser-only URL", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(new Blob(["hello"], { type: "video/mp4" })),
  );
  assert.deepEqual(
    await attachMedia({ name: "clip.mp4", kind: "video", url: "blob:local-private" }),
    { name: "clip.mp4", kind: "video", mime: "video/mp4", data: "aGVsbG8=" },
  );
});
