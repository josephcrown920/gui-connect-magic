import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, ARK_BASE, apiKey, arkKey } from "@/lib/gateway.server";
import { AGENTS, agentById } from "@/lib/agents";

type Body = {
  agent: string;
  brief: string;
  history?: { role: "user" | "assistant"; text: string }[];
  assets: { id: string; name: string; kind: string; dur: number }[];
  clips: { id: string; assetId: string; track: string; start: number; dur: number }[];
};

const LOOKS = "none, gold hour, noir, violet dusk, teal & orange, bleach, dreamy, crimson";

const BASE_SYSTEM = `You are an AI video co-editor working inside a multi-track non-linear editor.
Tracks, top to bottom: V3 (titles/overlays), V2 (b-roll/inserts), V1 (main footage), A1 (dialogue/VO), A2 (music/SFX).
You receive the user's media bin and the current timeline, then respond with edit decisions.

Reply with ONLY a JSON object, no markdown fence:
{
  "reply": "short conversational answer to the editor, first person, under 60 words",
  "steps": ["short log lines describing what you did, e.g. 'Cut rush_02 at 00:04:12'"],
  "actions": [ ... ]
}
Action shapes (seconds, decimals allowed):
{"op":"add","assetId":"<id from media bin>","track":"V1","start":0,"dur":4,"name":"optional label"}
{"op":"move","clipId":"<id>","track":"V2","start":3.5}
{"op":"trim","clipId":"<id>","dur":2.5}
{"op":"split","clipId":"<id>","at":1.8}
{"op":"remove","clipId":"<id>"}
{"op":"set","clipId":"<id>","volume":0.4,"opacity":0.8,"speed":1.5,"filter":"noir"}
Looks: ${LOOKS}.
Only use assetIds and clipIds that exist. Never leave gaps on V1 unless asked. Keep audio under the video it belongs to.
If the media bin is empty, ask for files and return an empty actions array.`;

const ORCHESTRATOR_SYSTEM = `${BASE_SYSTEM}

You are the ORCHESTRATOR: you run a crew of specialist editing agents and answer on their behalf.
Crew: ${AGENTS.filter((a) => a.available && a.id !== "orchestrator").map((a) => `${a.name} (${a.role})`).join("; ")}.
Also add a "crew" field: an array of 1-3 short strings naming which specialists you routed this brief to and why, e.g. "Claude Codex — timecode-accurate cuts".
Begin your steps with the routing decision, then the concrete edits you made.`;

function extractJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { reply: text.slice(0, 400), steps: [], actions: [], crew: [] };
  try {
    const p = JSON.parse(m[0]) as Record<string, unknown>;
    return {
      reply: typeof p["reply"] === "string" ? p["reply"] : "Done.",
      steps: Array.isArray(p["steps"]) ? (p["steps"] as string[]).slice(0, 12) : [],
      actions: Array.isArray(p["actions"]) ? p["actions"] : [],
      crew: Array.isArray(p["crew"]) ? (p["crew"] as string[]).slice(0, 4) : [],
    };
  } catch {
    return { reply: text.slice(0, 400), steps: [], actions: [], crew: [] };
  }
}

async function runOpenAI(model: string, key: string, system: string, user: string, history: Body["history"]) {
  const messages = [
    { role: "system", content: system },
    ...(history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: user },
  ];
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model, messages, reasoning_effort: "low", max_completion_tokens: 4000, response_format: { type: "json_object" } }),
  });
  if (!res.ok) return { error: await res.text(), status: res.status };
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

async function runModelArk(model: string, system: string, user: string, history: Body["history"]) {
  const key = arkKey();
  if (!key) {
    return { error: "ModelArk is not connected on this workspace. Add a ModelArk API key to use these agents.", status: 401 };
  }
  const messages = [
    { role: "system", content: system },
    ...(history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: user },
  ];
  const res = await fetch(`${ARK_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.4 }),
  });
  if (!res.ok) return { error: await res.text(), status: res.status };
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

async function runAnthropic(model: string, key: string, system: string, user: string, history: Body["history"]) {
  const messages = [
    ...(history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.text })),
    { role: "user" as const, content: user },
  ];
  const res = await fetch(`${GATEWAY}/v1/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model, max_tokens: 6000, system, messages, stream: true }),
  });
  if (!res.ok || !res.body) return { error: await res.text(), status: res.status };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: { type?: string; text?: string } };
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text ?? "";
      } catch {
        /* partial frame */
      }
    }
  }
  return { text };
}

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = (await request.json()) as Body;
        const agent = agentById(b.agent);
        const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

        if (!agent.available || !agent.model) {
          return json({ reply: `${agent.name} isn't available on this workspace yet. Pick another editor.`, steps: [], actions: [], crew: [] });
        }

        const system = agent.id === "orchestrator" ? ORCHESTRATOR_SYSTEM : BASE_SYSTEM;
        const user = [
          `MEDIA BIN:\n${b.assets.length ? b.assets.map((a) => `- ${a.id} | ${a.name} | ${a.kind} | ${a.dur.toFixed(1)}s`).join("\n") : "(empty)"}`,
          `TIMELINE:\n${b.clips.length ? b.clips.map((c) => `- ${c.id} | asset ${c.assetId} | ${c.track} | ${c.start.toFixed(1)}s → ${(c.start + c.dur).toFixed(1)}s`).join("\n") : "(empty)"}`,
          `BRIEF: ${b.brief}`,
        ].join("\n\n");

        let out: { text?: string; error?: string; status?: number };
        if (agent.api === "modelark") {
          out = await runModelArk(agent.model, system, user, b.history);
        } else {
          const key = apiKey();
          out = agent.api === "anthropic"
            ? await runAnthropic(agent.model, key, system, user, b.history)
            : await runOpenAI(agent.model, key, system, user, b.history);
        }

        if (out.error) {
          const status = out.status ?? 500;
          const msg =
            status === 401 && agent.api === "modelark" ? out.error
            : status === 402 ? "The workspace is out of AI credits."
            : status === 429 ? "Rate limited — try again in a moment."
            : "The editor agent couldn't respond.";
          return json({ reply: msg, steps: [], actions: [], crew: [] }, status);
        }
        return json(extractJson(out.text ?? ""));
      },
    },
  },
});
