export type AgentApi = "openai" | "anthropic";

export type Agent = {
  id: string;
  name: string;
  short: string;
  role: string;
  model?: string;
  api?: AgentApi;
  available: boolean;
  accent: string;
};

export const AGENTS: Agent[] = [
  { id: "astra", name: "GPT-6 Astra", short: "AS", role: "Creative director · pacing & structure", model: "openai/gpt-6-astra", api: "openai", available: true, accent: "var(--chart-1)" },
  { id: "codex", name: "Claude Codex", short: "CX", role: "Precision cuts · timecode & assembly", model: "anthropic/claude-opus-5-5", api: "anthropic", available: true, accent: "var(--chart-2)" },
  { id: "fable", name: "Claude Fable", short: "FB", role: "Narrative · emotional pacing", model: "anthropic/claude-fable-5-1", api: "anthropic", available: true, accent: "var(--chart-3)" },
  { id: "gemini", name: "Gemini Omni", short: "GM", role: "Rush scanning · b-roll discovery", model: "google/gemini-3.8-flash", api: "openai", available: true, accent: "var(--chart-4)" },
  { id: "sonnet", name: "Claude Sonnet", short: "SN", role: "Balanced everyday editing", model: "anthropic/claude-sonnet-5", api: "anthropic", available: true, accent: "var(--chart-5)" },
  { id: "luna", name: "GPT-6 Luna", short: "LN", role: "Fast rough cuts · silence trims", model: "openai/gpt-6-luna", api: "openai", available: true, accent: "var(--chart-1)" },
  { id: "glm", name: "GLM", short: "GL", role: "Rapid assembly", available: false, accent: "var(--chart-2)" },
  { id: "deepseek", name: "DeepSeek", short: "DS", role: "Speech alignment · silence strip", available: false, accent: "var(--chart-3)" },
  { id: "dola", name: "Dola", short: "DL", role: "Motion & transition FX", available: false, accent: "var(--chart-4)" },
  { id: "seedpro", name: "Seed Pro", short: "SP", role: "Generative b-roll", available: false, accent: "var(--chart-5)" },
  { id: "seedance", name: "Seedance", short: "SD", role: "Generative motion clips", available: false, accent: "var(--chart-1)" },
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
