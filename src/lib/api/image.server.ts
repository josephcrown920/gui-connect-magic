import { proxyToShared } from "../shared-proxy.server.ts";
import { authorizeStudio } from "../studio-access.server.ts";
import { GATEWAY, IMAGE_MODEL, apiKey, passthrough } from "../gateway.server.ts";
import { FAL_IMAGES } from "../media-catalog.ts";
import { falImage, mediaError } from "../fal.server.ts";
import { IMAGE_ENGINES } from "../engines.ts";

function resolve(engine?: string) {
  const e = IMAGE_ENGINES.find((x) => x.id === engine);
  if (!e) return { model: IMAGE_MODEL };
  if (!e.available || !e.model)
    return {
      error: `${e.name} is not available on this workspace yet. Pick another image engine.`,
    };
  return { model: e.model };
}

// JSON {prompt, engine} = generate; multipart (prompt + image + engine) = edit by prompt

export async function handleImage(request: Request) {
  const denied = await authorizeStudio(request);
  if (denied) return denied;
  const shared = await proxyToShared(request);
  if (shared) return shared;
  const requestType = request.headers.get("content-type") ?? "";
  // Clone to inspect routing without consuming the existing gateway body.
  const copy = request.clone();
  const formInput = requestType.includes("multipart") ? await copy.formData() : null;
  const jsonInput = formInput
    ? null
    : ((await copy.json()) as { engine?: string; prompt?: string });
  const selectedEngine = String(formInput?.get("engine") ?? jsonInput?.engine ?? "sunburst");
  if (!IMAGE_ENGINES.some((e) => e.id === selectedEngine))
    return Response.json({ error: "Unknown image engine." }, { status: 400 });
  const config = FAL_IMAGES[selectedEngine];
  if (
    config &&
    (process.env["FAL_KEY"] ||
      ["seedream", "flux", "gptimage2", "fluxschnell"].includes(selectedEngine))
  ) {
    try {
      const prompt = String(formInput?.get("prompt") ?? jsonInput?.prompt ?? "").trim();
      if (!prompt || prompt.length > 6000)
        return Response.json(
          { error: "A prompt of 1–6000 characters is required." },
          { status: 400 },
        );
      const image = formInput?.get("image");
      let source: string | undefined;
      if (image instanceof File) {
        if (image.size > 10 * 1024 * 1024 || !image.type.startsWith("image/"))
          return Response.json({ error: "Use an image smaller than 10 MB." }, { status: 400 });
        const bytes = new Uint8Array(await image.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 32768)
          binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        source = `data:${image.type};base64,${btoa(binary)}`;
      }
      if (source && !config.edit)
        return Response.json(
          {
            error: {
              message:
                "This open-source image model generates images only. Choose Seedream or FLUX.2 Pro for editing.",
            },
          },
          { status: 400 },
        );
      return await falImage(
        source ? config.edit! : config.create,
        { ...config.defaults, prompt, ...(source ? { image_urls: [source] } : {}) },
        request.signal,
      );
    } catch (error) {
      return mediaError(error);
    }
  }
  const key = apiKey();
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart")) {
    const form = await request.formData();
    const r = resolve(String(form.get("engine") ?? ""));
    if (r.error) return Response.json({ error: { message: r.error } }, { status: 400 });
    form.set("model", r.model!);
    form.delete("engine");
    form.delete("stream");
    return passthrough(
      await fetch(`${GATEWAY}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      }),
    );
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
}
