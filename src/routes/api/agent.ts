import { createFileRoute } from "@tanstack/react-router";
import { GATEWAY, apiKey } from "@/lib/gateway.server";
import { agentById } from "@/lib/agents";

type Body = {
  agent: string;
  brief: string;
  history?: { role: "user" | "assistant"; text: string }[];
  assets: { id: string; name: string; kind: string; dur: number }[];
  clips: { id: string; assetId: string; track: string; start: number; dur: number }[];
};

const SYSTEM = `You are an AI video co-editor working inside a multi-track non-linear editor.
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
{"op":"set","clipId":"<id>","volume":0.4,"opacity":0.8,"speed":1.5,"filter":"warm"}
Filters: none, warm, cool, mono, contrast, dreamy.
Only use assetIds and clipIds that exist. Never leave gaps on V1 unless asked. Keep audio under the video it belongs to.
If the media bin is empty, ask for files and return an empty actions array.`;

function extractJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { reply: text.slice(0, 400), steps: [], actions: [] };
  try {
    const p = JSON.parse(m[0]) as Record<string, unknown>;
    return {
      reply: typeof p["reply"] === "string" ? p["reply"] : "Done.",
      steps: Array.isArray(p["steps"]) ? (p["steps"] as string[]).slice(0, 12) : [],
      actions: Array.isArray(p["actions"]) ? p["actions"] : [],
    };
  } catch {
    return { reply: text.slice(0, 400), steps: [], actions: [] };
  }
}

async function runOpenAI(model: string, key: string, user: string, history: Body["history"]) {
  const messages = [
    { role: "system", content: SYSTEM },
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

async function runAnthropic(model: string, key: string, user: string, history: Body["history"]) {
  const messages = [
    ...(history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.text })),
    { role: "user" as const, content: user },
  ];
  const res = await fetch(`${GATEWAY}/v1/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model, max_tokens: 6000, system: SYSTEM, messages, stream: true }),
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
        const key = apiKey();
        const b = (await request.json()) as Body;
        const agent = agentById(b.agent);
        if (!agent.available || !agent.model) return new Response(JSON.stringify({ reply: `${agent.name} isn't available on this workspace yet. Pick another editor.`, steps: [], actions: [] }), { headers: { "Content-Type": "application/json" } });

        const user = [
          `MEDIA BIN:\n${b.assets.length ? b.assets.map((a) => `- ${a.id} | ${a.name} | ${a.kind} | ${a.dur.toFixed(1)}s`).join("\n") : "(empty)"}`,
          `TIMELINE:\n${b.clips.length ? b.clips.map((c) => `- ${c.id} | asset ${c.assetId} | ${c.track} | ${c.start.toFixed(1)}s → ${(c.start + c.dur).toFixed(1)}s`).join("\n") : "(empty)"}`,
          `BRIEF: ${b.brief}`,
        ].join("\n\n");

        const out = agent.api === "anthropic" ? await runAnthropic(agent.model, key, user, b.history) : await runOpenAI(agent.model, key, user, b.history);
        if ("error" in out && out.error) {
          const status = out.status ?? 500;
          const msg = status === 402 ? "The workspace is out of AI credits." : status === 429 ? "Rate limited — try again in a moment." : "The editor agent couldn't respond.";
          return new Response(JSON.stringify({ reply: msg, steps: [], actions: [] }), { status, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(extractJson(out.text ?? "")), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
