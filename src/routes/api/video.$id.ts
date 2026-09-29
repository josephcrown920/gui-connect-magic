import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, apiKey, passthrough } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/video/$id")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        passthrough(await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(params.id)}`, { headers: { Authorization: `Bearer ${apiKey()}` } })),
    },
  },
});
