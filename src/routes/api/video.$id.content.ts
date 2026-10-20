import { authorizeStudio } from "@/lib/studio-access.server";
import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, apiKey } from "@/lib/gateway.server";

import { falContent, mediaError } from "@/lib/fal.server";

export const Route = createFileRoute("/api/video/$id/content")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const denied = await authorizeStudio(request); if (denied) return denied;
        if (params.id.startsWith("fal_")) {
          try { return await falContent(params.id); } catch (error) { return mediaError(error); }
        }
        const r = await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(params.id)}/content`, { headers: { Authorization: `Bearer ${apiKey()}` } });
        return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") ?? "video/mp4" } });
      },
    },
  },
});
