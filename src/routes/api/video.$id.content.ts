import { createFileRoute } from "@tanstack/react-router";
import { handleVideoContent } from "@/lib/api/video-content.server";

export const Route = createFileRoute("/api/video/$id/content")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleVideoContent(request, params.id),
    },
  },
});
