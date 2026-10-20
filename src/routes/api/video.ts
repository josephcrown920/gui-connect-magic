import { authorizeStudio } from "@/lib/studio-access.server";
import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, VIDEO_MODEL, apiKey, passthrough } from "@/lib/gateway.server";
import { FAL_VIDEOS, FAL_PERFORMANCE, falVideoInput, performanceInput } from "@/lib/media-catalog";
import { submitFal, signJob, mediaError } from "@/lib/fal.server";
import { VIDEO_ENGINES } from "@/lib/engines";

type Media = { data: string; mime: string };
type Body = { prompt: string; engine?: string; motion?: string; duration?: string; image?: Media; video?: Media; audio?: Media; referenceVideo?: Media };

// Creates a video job. Client polls /api/video/$id.
export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authorizeStudio(request); if (denied) return denied;
        let b: Body;
        try { b = await request.json() as Body; } catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
        if (!b || typeof b.prompt !== "string") return Response.json({ error: "Prompt required." }, { status: 400 });
        if (b.image && (typeof b.image.data !== "string" || b.image.data.length > 14 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(b.image.mime))) return Response.json({ error: "Use a PNG, JPEG or WebP image smaller than 10 MB." }, { status: 400 });
        if (b.duration && !/^(6|8|10)s$/.test(b.duration)) return Response.json({ error: "Choose a 6, 8 or 10 second clip." }, { status: 400 });
        if (b.engine && !VIDEO_ENGINES.some(e => e.id === b.engine) && !Object.hasOwn(FAL_PERFORMANCE, b.engine)) return Response.json({ error: "Unknown video engine." }, { status: 400 });
        if (!b.prompt?.trim()) return new Response("Prompt required", { status: 400 });

        if (Object.hasOwn(FAL_PERFORMANCE, b.engine ?? "")) {
          try {
            for (const media of [b.audio, b.referenceVideo]) {
              if (media && (typeof media.data !== "string" || media.data.length > 28 * 1024 * 1024 || !/^(audio|video)\/[a-zA-Z0-9.+-]+$/.test(media.mime))) return Response.json({ error: "Use an audio/video file smaller than 20 MB." }, { status: 400 });
            }
            const data = (media?: Media) => media ? `data:${media.mime};base64,${media.data}` : undefined;
            const routed = performanceInput(b.engine!, data(b.image), data(b.audio), data(b.referenceVideo));
            const id = await submitFal(routed.endpoint, routed.input);
            return Response.json({ id: await signJob(routed.endpoint, id), status: "queued" });
          } catch (error) { return mediaError(error); }
        }
        if (FAL_VIDEOS[b.engine ?? "seedance"]) {
          try {
            if (b.prompt.length > 6000) return Response.json({ error: "Prompt is too long." }, { status: 400 });
            const image = b.image ? `data:${b.image.mime};base64,${b.image.data}` : undefined;
            const routed = falVideoInput(b.engine ?? "seedance", b.motion ? `${b.prompt}\n${b.motion}` : b.prompt, Number.parseInt(b.duration ?? "6s"), image);
            const id = await submitFal(routed.endpoint, routed.input);
            return Response.json({ id: await signJob(routed.endpoint, id), status: "queued" });
          } catch (error) { return mediaError(error); }
        }
        const key = apiKey();
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
