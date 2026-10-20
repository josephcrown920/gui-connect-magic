import { createFileRoute } from "@tanstack/react-router";
import { handleVideoStatus } from "@/lib/api/video-status.server";

export const Route = createFileRoute("/api/video/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleVideoStatus(request, params.id),
    },
  },
});
