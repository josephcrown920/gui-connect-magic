import { authorizeStudio } from "@/lib/studio-access.server";
import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, apiKey, passthrough } from "@/lib/gateway.server";

import { falStatus, mediaError } from "@/lib/fal.server";

export const Route = createFileRoute("/api/video/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const denied = await authorizeStudio(request); if (denied) return denied;
        if (params.id.startsWith("fal_")) {
          try { return Response.json(await falStatus(params.id)); } catch (error) { return mediaError(error); }
        }
        return passthrough(await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(params.id)}`, { headers: { Authorization: `Bearer ${apiKey()}` } }));
      },
    },
  },
});
