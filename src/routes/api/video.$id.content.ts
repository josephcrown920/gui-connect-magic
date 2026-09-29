import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, apiKey } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/video/$id/content")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const r = await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(params.id)}/content`, { headers: { Authorization: `Bearer ${apiKey()}` } });
        return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") ?? "video/mp4" } });
      },
    },
  },
});
