import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, VIDEO_MODEL, apiKey, passthrough } from "@/lib/gateway.server";

type Media = { data: string; mime: string };
type Body = { prompt: string; duration?: string; image?: Media; video?: Media };

// Creates a video job. Client polls /api/video/$id.
export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = apiKey();
        const b = (await request.json()) as Body;
        if (!b.prompt?.trim()) return new Response("Prompt required", { status: 400 });
        const parts: unknown[] = [{ type: "text", text: b.prompt }];
        if (b.image) parts.push({ type: "image", data: b.image.data, mime_type: b.image.mime });
        if (b.video) parts.push({ type: "video", data: b.video.data, mime_type: b.video.mime });
        const response_format: Record<string, string> = { type: "video", resolution: "720p", duration: b.duration ?? "6s" };
        if (!b.video) response_format.aspect_ratio = "16:9";
        return passthrough(
          await fetch(`${GATEWAY}/v1/videos`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: VIDEO_MODEL, input: parts.length === 1 ? b.prompt : parts, response_format }),
          }),
        );
      },
    },
  },
});
