export const GATEWAY = "https://ai.gateway.lovable.dev";
export const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";
export const VIDEO_MODEL = "google/veo-3.1-fast";

/** ModelArk (Volcengine Ark) — optional, enabled by setting ARK_API_KEY. */
export const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";

export function arkKey() {
  return process.env["ARK_API_KEY"] ?? "";
}

export function apiKey() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Response("AI is not configured", { status: 500 });
  return k;
}

export function passthrough(upstream: Response) {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-cache" },
  });
}
