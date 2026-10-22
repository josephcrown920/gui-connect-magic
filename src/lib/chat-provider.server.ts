import { OLLAMA_MODELS } from "./ollama-models.ts";
import type { ChatMessage } from "./multimodal.ts";
export type ChatTarget = { url: string; key: string; provider: string };
export function chatTarget(
  preferred: "auto" | "openrouter" | "lovable" | "ollama" = "auto",
): ChatTarget {
  if (preferred === "ollama") {
    const base = new URL(process.env["OLLAMA_BASE_URL"] ?? "http://127.0.0.1:11434");
    if (
      base.protocol !== "https:" &&
      !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
    )
      throw new Error("Use HTTPS for remote Ollama servers.");
    return {
      url: `${base.href.replace(/\/$/, "")}/v1/chat/completions`,
      key: process.env["OLLAMA_API_KEY"] ?? "",
      provider: "Ollama",
    };
  }
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
  ...OLLAMA_MODELS,
  { id: "qwen-open", name: "Qwen3 32B · open weights", model: "qwen/qwen3-32b" },
  { id: "deepseek-open", name: "DeepSeek V3.2 · open weights", model: "deepseek/deepseek-v3.2" },
  { id: "astra", name: "GPT-6 Astra", model: "openai/gpt-6-astra" },
  { id: "deepseek", name: "DeepSeek V4.1 Flash", model: "deepseek/deepseek-v4.1-flash" },
  { id: "claude", name: "Claude Sonnet 5", model: "anthropic/claude-sonnet-5" },
  { id: "qwen", name: "Qwen 3.8 Flash", model: "qwen/qwen3.8-flash" },
  { id: "minimax", name: "MiniMax M3", model: "minimax/minimax-m3" },
] as const;

export function plannerModel(id: string | undefined) {
  const planner = PLANNERS.find((p) => p.id === (id ?? "astra"));
  if (!planner) throw new Error("Choose a supported planning agent.");
  return (
    process.env[`STUDIO_${planner.id.toUpperCase().replace(/-/g, "_")}_MODEL`] ?? planner.model
  );
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
      ...(target.key ? { Authorization: `Bearer ${target.key}` } : {}),
      "Content-Type": "application/json",
      "X-Title": "Reel Video Studio",
      ...(target.provider === "Lovable AI" ? { "X-Lovable-AIG-SDK": "fetch" } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      ...(target.provider === "Ollama" ? { think: false } : {}),
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
