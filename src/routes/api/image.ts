import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, IMAGE_MODEL, apiKey, passthrough } from "@/lib/gateway.server";

// JSON {prompt} = generate; multipart (prompt + image) = edit by prompt
export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = apiKey();
        const type = request.headers.get("content-type") ?? "";
        if (type.includes("multipart")) {
          const form = await request.formData();
          form.set("model", IMAGE_MODEL);
          form.delete("stream");
          return passthrough(await fetch(`${GATEWAY}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }));
        }
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim()) return new Response("Prompt required", { status: 400 });
        return passthrough(
          await fetch(`${GATEWAY}/v1/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1536x1024" }),
          }),
        );
      },
    },
  },
});
