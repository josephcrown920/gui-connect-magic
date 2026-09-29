import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, VIDEO_MODEL, apiKey, passthrough } from "@/lib/gateway.server";
import { VIDEO_ENGINES } from "@/lib/engines";

type Media = { data: string; mime: string };
type Body = { prompt: string; engine?: string; motion?: string; duration?: string; image?: Media; video?: Media };

// Creates a video job. Client polls /api/video/$id.
export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = apiKey();
        const b = (await request.json()) as Body;
        if (!b.prompt?.trim()) return new Response("Prompt required", { status: 400 });

        const e = VIDEO_ENGINES.find((x) => x.id === b.engine);
        if (e && (!e.available || !e.model)) {
          return Response.json({ error: { message: `${e.name} is not available on this workspace yet. Pick another video engine.` } }, { status: 400 });
        }
        const model = e?.model ?? VIDEO_MODEL;

        const prompt = b.motion ? `${b.prompt}\n\n${b.motion}` : b.prompt;
        const parts: unknown[] = [{ type: "text", text: prompt }];
        if (b.image) parts.push({ type: "image", data: b.image.data, mime_type: b.image.mime });
        if (b.video) parts.push({ type: "video", data: b.video.data, mime_type: b.video.mime });
        const response_format: Record<string, string> = { type: "video", resolution: "720p", duration: b.duration ?? "6s" };
        if (!b.video) response_format["aspect_ratio"] = "16:9";

        return passthrough(
          await fetch(`${GATEWAY}/v1/videos`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, input: parts.length === 1 ? prompt : parts, response_format }),
          }),
        );
      },
    },
  },
});
