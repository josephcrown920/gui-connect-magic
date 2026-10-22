import { OLLAMA_MODELS } from "./ollama-models.ts";
export type AgentApi = "openai" | "anthropic" | "modelark" | "openrouter" | "ollama";

export type Agent = {
  id: string;
  name: string;
  short: string;
  role: string;
  model?: string;
  api?: AgentApi;
  available: boolean;
  vision?: boolean;
  accent: string;
  /** Shown in the picker so the user knows where the agent runs. */
  provider: string;
};

export const AGENTS: Agent[] = [
  ...OLLAMA_MODELS.map((m) => ({
    ...m,
    short: m.vision ? "QV" : "OL",
    role: m.vision
      ? "Image understanding and edit planning"
      : "Reasoning, scripts and production planning",
    api: "ollama" as const,
    available: true,
    accent: "var(--chart-3)",
    provider: "Ollama",
  })),
  { id: "qwen-open", name: "Qwen3 32B · open weights", short: "Q3", role: "Open-weight script and edit planner", model: "qwen/qwen3-32b", api: "openrouter", available: true, accent: "var(--chart-3)", provider: "OpenRouter" },
  { id: "deepseek-open", name: "DeepSeek V3.2 · open weights", short: "D3", role: "Open-weight script and edit planner", model: "deepseek/deepseek-v3.2", api: "openrouter", available: true, accent: "var(--chart-4)", provider: "OpenRouter" },
  { id: "omni-reader", name: "Qwen Omni · Understand", short: "OM", role: "Text chat · image and video understanding", model: "qwen/qwen3.8-omni-flash", api: "openrouter", available: true, accent: "var(--chart-5)", provider: "OpenRouter" },
  { id: "orchestrator", name: "Orchestrator", short: "OR", role: "Runs the crew · routes every brief to the right agent", model: "openai/gpt-6-astra", api: "openai", available: true, accent: "var(--chart-1)", provider: "Lovable AI" },
  { id: "astra", name: "GPT-6 Astra", short: "AS", role: "Creative director · pacing & structure", model: "openai/gpt-6-astra", api: "openai", available: true, accent: "var(--chart-1)", provider: "Lovable AI" },
  { id: "codex", name: "Claude Codex", short: "CX", role: "Precision cuts · timecode & assembly", model: "anthropic/claude-opus-5-5", api: "anthropic", available: true, accent: "var(--chart-2)", provider: "Lovable AI" },
  { id: "fable", name: "Claude Fable", short: "FB", role: "Narrative · emotional pacing", model: "anthropic/claude-fable-5-1", api: "anthropic", available: true, accent: "var(--chart-4)", provider: "Lovable AI" },
  { id: "gemini", name: "Gemini Omni", short: "GM", role: "Rush scanning · b-roll discovery", model: "google/gemini-3.8-flash", api: "openai", available: true, accent: "var(--chart-5)", provider: "Lovable AI" },
  { id: "sonnet", name: "Claude Sonnet", short: "SN", role: "Balanced everyday editing", model: "anthropic/claude-sonnet-5", api: "anthropic", available: true, accent: "var(--chart-2)", provider: "Lovable AI" },
  { id: "luna", name: "GPT-6 Luna", short: "LN", role: "Fast rough cuts · silence trims", model: "openai/gpt-6-luna", api: "openai", available: true, accent: "var(--chart-1)", provider: "Lovable AI" },
  // ModelArk crew — live only when a ModelArk key is configured on the server.
  { id: "ark-doubao", name: "Doubao Pro", short: "DB", role: "ModelArk · long-form assembly", model: "doubao-pro-32k", api: "modelark", available: true, accent: "var(--chart-3)", provider: "ModelArk" },
  { id: "ark-seed", name: "Seed 1.6", short: "SD", role: "ModelArk · reasoning & shot logic", model: "doubao-seed-1-6", api: "modelark", available: true, accent: "var(--chart-3)", provider: "ModelArk" },
  { id: "ark-skylark", name: "Skylark Lite", short: "SK", role: "ModelArk · fast trims", model: "skylark-lite", api: "modelark", available: true, accent: "var(--chart-3)", provider: "ModelArk" },
  { id: "glm", name: "GLM", short: "GL", role: "Rapid assembly", available: false, accent: "var(--chart-2)", provider: "Not connected" },
  { id: "deepseek", name: "DeepSeek V4.1 Flash", short: "DS", role: "Script and edit planning", model: "deepseek/deepseek-v4.1-flash", api: "openrouter", available: true, accent: "var(--chart-4)", provider: "OpenRouter" },
  { id: "qwen", name: "Qwen 3.8 Flash", short: "QW", role: "Fast script and edit planning", model: "qwen/qwen3.8-flash", api: "openrouter", available: true, accent: "var(--chart-3)", provider: "OpenRouter" },
  { id: "minimax", name: "MiniMax M3", short: "MM", role: "Script and production reasoning", model: "minimax/minimax-m3", api: "openrouter", available: true, accent: "var(--chart-5)", provider: "OpenRouter" },
  { id: "dola", name: "Dola", short: "DL", role: "Motion & transition FX", available: false, accent: "var(--chart-5)", provider: "Not connected" },
];

export function agentById(id: string) {
  return AGENTS.find((a) => a.id === id) ?? AGENTS.find(a => a.id === "orchestrator")!;
}

export const TRACKS = ["V3", "V2", "V1", "A1", "A2"] as const;
export type TrackId = (typeof TRACKS)[number];

export const TRACK_LABEL: Record<TrackId, string> = {
  V3: "Titles & overlays",
  V2: "B-roll & inserts",
  V1: "Main footage",
  A1: "Dialogue / VO",
  A2: "Music & SFX",
};

export type AgentAction =
  | { op: "add"; assetId: string; track: TrackId; start: number; dur: number; name?: string }
  | { op: "move"; clipId: string; track?: TrackId; start?: number }
  | { op: "trim"; clipId: string; dur: number }
  | { op: "split"; clipId: string; at: number }
  | { op: "remove"; clipId: string }
  | { op: "set"; clipId: string; volume?: number; opacity?: number; speed?: number; filter?: string };

export type AgentReply = { reply: string; steps: string[]; actions: AgentAction[] };

/** Stages the orchestrator reports while it routes a brief through the crew. */
export const ORCHESTRATOR_STAGES = [
  "Reading the brief",
  "Scanning the media bin",
  "Choosing the crew",
  "Drafting edit decisions",
  "Applying to the timeline",
] as const;
