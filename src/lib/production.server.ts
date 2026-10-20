import { GATEWAY } from "./gateway.server";
import { productionRequestSchema, validatePlan } from "./production";

const schemaInstructions = `Return only JSON: {"title":"...","summary":"...","scenes":[{"id":"scene-1","title":"...","prompt":"detailed visual prompt","narration":"script text, not rendered audio","duration":6,"source":"generate"}]}. Use source "existing" and assetId only for supplied visual media. Each scene 2–8 seconds, maximum 10 scenes and 60 seconds total. Do not exceed a source video's duration. Keep a consistent visual style and characters across prompts. Narration is a script only; do not claim voice, music, captions or export have been generated. Never invent source IDs. For revisions reuse existing media where it fits, while following the new brief.`;

async function specialist(role: string, input: string, key: string, signal?: AbortSignal) {
  const response = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    signal: signal ?? null,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: process.env["STUDIO_PLANNER_MODEL"] ?? "openai/gpt-6-astra",
      messages: [
        { role: "system", content: `${role}\n${schemaInstructions}` },
        { role: "user", content: input },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 6000,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 402
        ? "The workspace is out of AI credits."
        : response.status === 429
          ? "AI rate limit reached. Try again shortly."
          : `Planning service failed (${response.status}). Check the workspace model configuration.`,
    );
  const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error("The planning agent returned an empty response.");
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("The planning agent returned an invalid scene plan. Try again.");
  }
}

export async function planProduction(raw: unknown, key: string, signal?: AbortSignal) {
  const input = productionRequestSchema.parse(raw);
  const context = JSON.stringify(input);
  const draft = validatePlan(
    await specialist(
      "You are the director and scriptwriter. Turn the brief into an achievable video storyboard.",
      context,
      key,
      signal,
    ),
    input.assets,
  );
  const reviewed = validatePlan(
    await specialist(
      "You are the continuity and pacing reviewer. Inspect the director's storyboard against the brief. Correct weak pacing, inconsistent prompts, invalid source references and runtime. Return the complete improved plan in the same schema.",
      JSON.stringify({ request: input, draft }),
      key,
      signal,
    ),
    input.assets,
  );
  return {
    plan: reviewed,
    steps: [
      "Director drafted the storyboard and script",
      "Reviewer checked continuity, sources and pacing",
    ],
  };
}
