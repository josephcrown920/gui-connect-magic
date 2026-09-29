export type AgentApi = "openai" | "anthropic" | "modelark";

export type Agent = {
  id: string;
  name: string;
  short: string;
  role: string;
  model?: string;
  api?: AgentApi;
  available: boolean;
  accent: string;
  /** Shown in the picker so the user knows where the agent runs. */
  provider: string;
};

export const AGENTS: Agent[] = [
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
  { id: "deepseek", name: "DeepSeek", short: "DS", role: "Speech alignment · silence strip", available: false, accent: "var(--chart-4)", provider: "Not connected" },
  { id: "dola", name: "Dola", short: "DL", role: "Motion & transition FX", available: false, accent: "var(--chart-5)", provider: "Not connected" },
];

export function agentById(id: string) {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0]!;
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
