import type { ChatMessage } from "./multimodal.ts";
export type ChatTarget = { url: string; key: string; provider: string };
export function chatTarget(preferred: "auto" | "openrouter" | "lovable" = "auto"): ChatTarget {
  if (preferred === "openrouter" || (preferred === "auto" && process.env["OPENROUTER_API_KEY"])) {
    const key = process.env["OPENROUTER_API_KEY"];
    if (!key) throw new Error("Add OPENROUTER_API_KEY to the server secrets to use OpenRouter.");
    return { url: "https://openrouter.ai/api/v1/chat/completions", key, provider: "OpenRouter" };
  }
  const key = process.env["LOVABLE_API_KEY"];
  if (!key)
    throw new Error(
      "Connect OpenRouter or Lovable AI in the server secrets before using an agent.",
    );
  return { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key, provider: "Lovable AI" };
}

export const PLANNERS = [
  { id: "astra", name: "GPT-6 Astra", model: "openai/gpt-6-astra" },
  { id: "deepseek", name: "DeepSeek V4.1 Flash", model: "deepseek/deepseek-v4.1-flash" },
  { id: "claude", name: "Claude Sonnet 5", model: "anthropic/claude-sonnet-5" },
  { id: "qwen", name: "Qwen 3.8 Flash", model: "qwen/qwen3.8-flash" },
  { id: "minimax", name: "MiniMax M3", model: "minimax/minimax-m3" },
] as const;

export function plannerModel(id: string | undefined) {
  const planner = PLANNERS.find((p) => p.id === (id ?? "astra"));
  if (!planner) throw new Error("Choose a supported planning agent.");
  return process.env[`STUDIO_${planner.id.toUpperCase()}_MODEL`] ?? planner.model;
}

export async function chatCompletion(
  target: ChatTarget,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
) {
  const response = await fetch(target.url, {
    method: "POST",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${target.key}`,
      "Content-Type": "application/json",
      "X-Title": "Reel Video Studio",
      ...(target.provider === "Lovable AI" ? { "X-Lovable-AIG-SDK": "fetch" } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 402
        ? `${target.provider} is out of credits.`
        : response.status === 429
          ? `${target.provider} rate limit reached. Retry shortly.`
          : `${target.provider} request failed (${response.status}). Check the selected model and credentials.`,
    );
  const result = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: unknown;
  };
  const text = result.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${target.provider} returned no agent response.`);
  return text;
}
