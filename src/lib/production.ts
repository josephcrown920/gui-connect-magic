import { z } from "zod";

export const mediaSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(300),
  kind: z.enum(["image", "video", "audio"]),
  dur: z.number().finite().positive().max(86400),
});
export type ProductionMedia = z.infer<typeof mediaSchema> & { url: string };
export const sceneSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .refine(
      (id) =>
        ![
          "__proto__",
          "constructor",
          "prototype",
          "toString",
          "valueOf",
          "hasOwnProperty",
        ].includes(id),
      "Invalid scene ID",
    ),
  title: z.string().min(1).max(160),
  prompt: z.string().min(1).max(2500),
  narration: z.string().max(1500),
  duration: z.number().finite().min(2).max(8),
  source: z.enum(["generate", "existing"]),
  assetId: z.string().max(100).optional(),
});
export const productionPlanSchema = z
  .object({
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(1500),
    scenes: z.array(sceneSchema).min(1).max(10),
  })
  .superRefine((plan, ctx) => {
    if (new Set(plan.scenes.map((s) => s.id)).size !== plan.scenes.length)
      ctx.addIssue({ code: "custom", message: "Scene IDs must be unique" });
    if (plan.scenes.reduce((n, s) => n + s.duration, 0) > 60)
      ctx.addIssue({ code: "custom", message: "Drafts are limited to 60 seconds" });
    for (const scene of plan.scenes) {
      if (scene.source === "existing" && !scene.assetId)
        ctx.addIssue({ code: "custom", message: "Existing scenes require an asset ID" });
    }
  });
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export const productionRequestSchema = z.object({
  brief: z.string().trim().min(1).max(6000),
  assets: z.array(mediaSchema).max(200),
  previousPlan: productionPlanSchema.optional(),
});

export function validatePlan(
  value: unknown,
  assets: z.infer<typeof mediaSchema>[],
): ProductionPlan {
  const plan = productionPlanSchema.parse(value);
  for (const scene of plan.scenes) {
    if (scene.source !== "existing") continue;
    const media = assets.find((a) => a.id === scene.assetId && a.kind !== "audio");
    if (!media) throw new Error(`Scene “${scene.title}” references missing visual media.`);
    if (media.kind === "video" && scene.duration > media.dur)
      throw new Error(`Scene “${scene.title}” exceeds its source video duration.`);
  }
  return plan;
}

export function assembleScenes(plan: ProductionPlan, media: Record<string, ProductionMedia>) {
  let start = 0;
  return plan.scenes.map((scene) => {
    const asset = media[scene.id];
    if (!asset) throw new Error(`Scene “${scene.title}” has no finished media.`);
    const clip = {
      id: `scene-${scene.id}-${asset.id}`,
      assetId: asset.id,
      track: "V1" as const,
      start,
      dur: scene.duration,
      inPoint: 0,
      name: scene.title,
      volume: 1,
      opacity: 1,
      speed: 1,
      filter: "none",
    };
    start += scene.duration;
    return clip;
  });
}

export type ProductionRun = {
  id: string;
  brief: string;
  plan: ProductionPlan;
  sources: ProductionMedia[];
  media: Record<string, ProductionMedia>;
  engine: string;
  kind: "image" | "video";
  jobs: Record<string, string>;
};

/** Sequential execution keeps provider spend bounded and checkpoints each scene.
 * Assembly happens only after every scene has finished. */
export async function executeProduction(
  run: ProductionRun,
  tools: {
    signal: AbortSignal;
    generate: (scene: ProductionPlan["scenes"][number]) => Promise<ProductionMedia>;
    checkpoint: (run: ProductionRun, media: ProductionMedia) => Promise<void>;
    status: (scene: ProductionPlan["scenes"][number], index: number) => void;
  },
) {
  for (let i = 0; i < run.plan.scenes.length; i++) {
    tools.signal.throwIfAborted();
    const scene = run.plan.scenes[i]!;
    if (Object.hasOwn(run.media, scene.id)) continue;
    tools.status(scene, i);
    let asset: ProductionMedia;
    if (scene.source === "existing") {
      const source = run.sources.find((a) => a.id === scene.assetId);
      if (!source) throw new Error(`Source media missing for ${scene.title}. Start a new plan.`);
      asset = source;
    } else {
      asset = await tools.generate(scene);
    }
    run.media[scene.id] = asset;
    await tools.checkpoint(run, asset);
  }
  tools.signal.throwIfAborted();
  return assembleScenes(run.plan, run.media);
}
