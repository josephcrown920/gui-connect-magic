import { createFileRoute } from "@tanstack/react-router";
import { handleImage } from "@/lib/api/image.server";

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: ({ request }) => handleImage(request),
    },
  },
});
