import { chatTarget, chatCompletion, plannerModel } from "./chat-provider.server.ts";
import { productionRequestSchema, validatePlan } from "./production.ts";

const schemaInstructions = `Return only JSON: {"title":"...","summary":"...","scenes":[{"id":"scene-1","title":"...","prompt":"detailed visual prompt","narration":"script text, not rendered audio","duration":6,"source":"generate"}]}. Use source "existing" and assetId only for supplied visual media. Each scene 2–8 seconds, maximum 10 scenes and 60 seconds total. Do not exceed a source video's duration. Keep a consistent visual style and characters across prompts. Narration is a script only; do not claim voice, music, captions or export have been generated. Never invent source IDs. For revisions reuse existing media where it fits, while following the new brief.`;

async function specialist(
  role: string,
  input: string,
  planner: string | undefined,
  provider: "auto" | "openrouter" | "lovable",
  signal?: AbortSignal,
) {
  const text = await chatCompletion(
    chatTarget(provider),
    plannerModel(planner),
    [
      { role: "system", content: `${role}\n${schemaInstructions}` },
      { role: "user", content: input },
    ],
    signal,
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The planning agent returned an invalid scene plan. Try again.");
  }
}

export async function planProduction(raw: unknown, signal?: AbortSignal) {
  const input = productionRequestSchema.parse(raw);
  const context = JSON.stringify(input);
  const draft = validatePlan(
    await specialist(
      "You are the director and scriptwriter. Turn the brief into an achievable video storyboard.",
      context,
      input.planner,
      input.provider,
      signal,
    ),
    input.assets,
  );
  const reviewed = validatePlan(
    await specialist(
      "You are the continuity and pacing reviewer. Inspect the director's storyboard against the brief. Correct weak pacing, inconsistent prompts, invalid source references and runtime. Return the complete improved plan in the same schema.",
      JSON.stringify({ request: input, draft }),
      input.planner,
      input.provider,
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
