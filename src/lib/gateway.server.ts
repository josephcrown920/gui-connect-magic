export const GATEWAY = "https://ai.gateway.lovable.dev";
export const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";
export const VIDEO_MODEL = "google/gemini-omni-1.1-flash";

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
