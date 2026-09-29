import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, IMAGE_MODEL, apiKey, passthrough } from "@/lib/gateway.server";
import { IMAGE_ENGINES } from "@/lib/engines";

function resolve(engine?: string) {
  const e = IMAGE_ENGINES.find((x) => x.id === engine);
  if (!e) return { model: IMAGE_MODEL };
  if (!e.available || !e.model) return { error: `${e.name} is not available on this workspace yet. Pick another image engine.` };
  return { model: e.model };
}

// JSON {prompt, engine} = generate; multipart (prompt + image + engine) = edit by prompt
export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = apiKey();
        const type = request.headers.get("content-type") ?? "";
        if (type.includes("multipart")) {
          const form = await request.formData();
          const r = resolve(String(form.get("engine") ?? ""));
          if (r.error) return Response.json({ error: { message: r.error } }, { status: 400 });
          form.set("model", r.model!);
          form.delete("engine");
          form.delete("stream");
          return passthrough(await fetch(`${GATEWAY}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }));
        }
        const { prompt, engine } = (await request.json()) as { prompt?: string; engine?: string };
        if (!prompt?.trim()) return new Response("Prompt required", { status: 400 });
        const r = resolve(engine);
        if (r.error) return Response.json({ error: { message: r.error } }, { status: 400 });
        return passthrough(
          await fetch(`${GATEWAY}/v1/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: r.model, prompt, size: "1536x1024" }),
          }),
        );
      },
    },
  },
});
