import { proxyToShared } from "@/lib/shared-proxy.server";
import { createFileRoute } from "@tanstack/react-router";
import { handleAgent, providerReadiness } from "@/lib/api/agent.server";

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await proxyToShared(request)) ??
        Response.json(providerReadiness(), { headers: { "Cache-Control": "no-store" } }),
      POST: ({ request }) => handleAgent(request),
    },
  },
});
