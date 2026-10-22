import { createFileRoute } from "@tanstack/react-router";
import { handleVideo } from "@/lib/api/video.server";

export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      POST: ({ request }) => handleVideo(request),
    },
  },
});
