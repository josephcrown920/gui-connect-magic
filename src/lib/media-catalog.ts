/** Verified fal endpoint IDs; kept separate from Lovable gateway model IDs. */
export const FAL_IMAGES: Record<
  string,
  { create: string; edit?: string; defaults?: Record<string, unknown> }
> = {
  fluxschnell: { create: "fal-ai/flux/schnell", defaults: { num_inference_steps: 4 } },
  sunburst: {
    create: "openai/gpt-image-2.5/sunburst/text-to-image",
    edit: "openai/gpt-image-2.5/sunburst/edit",
    defaults: { quality: "medium" },
  },
  gptimage2: {
    create: "fal-ai/gpt-image-2",
    edit: "fal-ai/gpt-image-2/edit",
    defaults: { quality: "medium" },
  },
  seedream: {
    create: "bytedance/seedream/v5/pro/text-to-image",
    edit: "bytedance/seedream/v5/pro/edit",
  },
  flux: { create: "fal-ai/flux-2-pro", edit: "fal-ai/flux-2-pro/edit" },
};
export const FAL_VIDEOS: Record<
  string,
  { text: string; image: string; defaults: Record<string, unknown> }
> = {
  wanopen: {
    text: "fal-ai/wan/v2.2-a14b/text-to-video",
    image: "fal-ai/wan/v2.2-a14b/image-to-video",
    defaults: { resolution: "720p" },
  },
  omni: {
    text: "google/gemini-omni-flash/v1.1/text-to-video",
    image: "google/gemini-omni-flash/v1.1/image-to-video",
    defaults: { resolution: "720p" },
  },
  klingomni: {
    text: "fal-ai/kling-video/o3/pro/text-to-video",
    image: "fal-ai/kling-video/o3/pro/image-to-video",
    defaults: { generate_audio: true },
  },
  seedance: {
    text: "bytedance/seedance-2.5/text-to-video",
    image: "bytedance/seedance-2.5/image-to-video",
    defaults: { resolution: "720p", generate_audio: true },
  },
  wan: {
    text: "fal-ai/wan/v2.7/text-to-video",
    image: "fal-ai/wan/v2.7/image-to-video",
    defaults: { resolution: "720p" },
  },
  ltx: {
    text: "fal-ai/ltx-2.3/text-to-video",
    image: "fal-ai/ltx-2.3/image-to-video",
    defaults: { resolution: "1080p", generate_audio: true },
  },
  minimax: {
    text: "minimax/h3-max/text-to-video",
    image: "minimax/h3-max/image-to-video",
    defaults: { resolution: "768P", prompt_expansion_mode: "balanced" },
  },
};
export function falVideoInput(engine: string, prompt: string, duration: number, image?: string) {
  const config = FAL_VIDEOS[engine];
  if (!config) throw new Error("Unsupported video engine.");
  if (![6, 8, 10].includes(duration)) throw new Error("Choose a 6, 8 or 10 second clip.");
  return {
    endpoint: image ? config.image : config.text,
    input: {
      ...config.defaults,
      prompt,
      ...(engine === "wanopen"
        ? { num_frames: duration * 16 + 1, frames_per_second: 16 }
        : { duration: ["seedance", "klingomni"].includes(engine) ? String(duration) : duration }),
      aspect_ratio: "16:9",
      ...(image ? { image_url: image } : {}),
    },
  };
}

export const FAL_PERFORMANCE = {
  omnihuman: "fal-ai/bytedance/omnihuman/v1.5",
  motion: "fal-ai/kling-video/v3/standard/motion-control",
} as const;
export function performanceInput(
  engine: string,
  image: string | undefined,
  audio: string | undefined,
  video: string | undefined,
) {
  if (!image) throw new Error("Choose a character image.");
  if (engine === "omnihuman") {
    if (!audio) throw new Error("Choose the speech or song audio to animate.");
    return {
      endpoint: FAL_PERFORMANCE.omnihuman,
      input: { image_url: image, audio_url: audio, resolution: "720p" },
    };
  }
  if (engine === "motion") {
    if (!video) throw new Error("Choose a reference video for motion transfer.");
    return {
      endpoint: FAL_PERFORMANCE.motion,
      input: { image_url: image, video_url: video, character_orientation: "video" },
    };
  }
  throw new Error("Unknown performance mode.");
}
