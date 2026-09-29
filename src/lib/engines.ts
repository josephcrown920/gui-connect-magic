/** Generation engines exposed in the model picker. */
export type Engine = {
  id: string;
  name: string;
  /** Gateway model id. Undefined when the engine is not served on this workspace. */
  model?: string;
  note: string;
  available: boolean;
};

/** Image engines. Seedream is the requested default but is not served by the gateway. */
export const IMAGE_ENGINES: Engine[] = [
  { id: "seedream", name: "Seedream", note: "Not served on this workspace yet", available: false },
  { id: "sunburst", name: "GPT Image 2.5 Sunburst", model: "openai/gpt-image-2.5-sunburst", note: "Default · photoreal plates & edits", available: true },
  { id: "flare", name: "GPT Image 2.5 Flare", model: "openai/gpt-image-2.5-flare", note: "Faster, lighter plates", available: true },
  { id: "gemini3pro", name: "Gemini 3 Pro Image", model: "google/gemini-3-pro-image", note: "Strong typography & composition", available: true },
  { id: "gemini31", name: "Gemini 3.1 Flash Image", model: "google/gemini-3.1-flash-image", note: "Fast iteration", available: true },
];

/** Video engines. Seedance is the requested default but is not served by the gateway. */
export const VIDEO_ENGINES: Engine[] = [
  { id: "seedance", name: "Seedance", note: "Not served on this workspace yet", available: false },
  { id: "veo31", name: "Veo 3.1", model: "google/veo-3.1", note: "Best motion fidelity", available: true },
  { id: "veo31fast", name: "Veo 3.1 Fast", model: "google/veo-3.1-fast", note: "Default · quick motion clips", available: true },
  { id: "veo31lite", name: "Veo 3.1 Lite", model: "google/veo-3.1-lite", note: "Cheapest drafts", available: true },
  { id: "omni", name: "Gemini Omni 1.1", model: "google/gemini-omni-1.1-flash", note: "Image-to-video & continuation", available: true },
];

export const DEFAULT_IMAGE_ENGINE = "sunburst";
export const DEFAULT_VIDEO_ENGINE = "veo31fast";

export function engineModel(list: Engine[], id: string) {
  return list.find((e) => e.id === id && e.available)?.model;
}

/* ---------- motion control ---------- */
export const CAMERA_MOVES = [
  { id: "static", label: "Locked off", phrase: "locked-off static camera, no movement" },
  { id: "push", label: "Push in", phrase: "slow dolly push in towards the subject" },
  { id: "pull", label: "Pull out", phrase: "slow dolly pull out revealing the wider scene" },
  { id: "panL", label: "Pan left", phrase: "smooth camera pan to the left" },
  { id: "panR", label: "Pan right", phrase: "smooth camera pan to the right" },
  { id: "tiltU", label: "Tilt up", phrase: "camera tilts upward" },
  { id: "tiltD", label: "Tilt down", phrase: "camera tilts downward" },
  { id: "orbit", label: "Orbit", phrase: "camera orbits around the subject" },
  { id: "crane", label: "Crane up", phrase: "crane shot rising above the scene" },
  { id: "handheld", label: "Handheld", phrase: "handheld camera with natural shake" },
] as const;

export const MOTION_CURVES = [
  { id: "linear", label: "Linear", phrase: "constant speed" },
  { id: "ease", label: "Ease in-out", phrase: "easing in and out of the move" },
  { id: "ramp", label: "Speed ramp", phrase: "starting slow then ramping into a fast move" },
] as const;

export type Motion = { move: string; intensity: number; curve: string; fps: number };

export const DEFAULT_MOTION: Motion = { move: "push", intensity: 5, curve: "ease", fps: 24 };

export function motionPhrase(m: Motion) {
  const move = CAMERA_MOVES.find((c) => c.id === m.move)?.phrase ?? "";
  const curve = MOTION_CURVES.find((c) => c.id === m.curve)?.phrase ?? "";
  const strength = m.intensity <= 3 ? "very subtle" : m.intensity <= 6 ? "moderate" : "bold and pronounced";
  return `Camera motion: ${move}, ${strength}, ${curve}. Shot at ${m.fps}fps.`;
}

/* ---------- look presets ---------- */
export const FILTERS: Record<string, string> = {
  none: "none",
  "gold hour": "saturate(1.25) sepia(.22) hue-rotate(-14deg) brightness(1.05)",
  noir: "grayscale(1) contrast(1.28)",
  "violet dusk": "saturate(1.3) hue-rotate(275deg) brightness(.97)",
  "teal & orange": "saturate(1.35) contrast(1.15) hue-rotate(-8deg)",
  bleach: "contrast(1.5) saturate(.55) brightness(1.08)",
  dreamy: "blur(.7px) brightness(1.1) saturate(1.25)",
  crimson: "saturate(1.4) hue-rotate(-25deg) contrast(1.1)",
};

/** One-click effect presets that set several clip properties at once. */
export type Preset = { id: string; label: string; filter?: string; speed?: number; opacity?: number; hint: string };

export const PRESETS: Preset[] = [
  { id: "cinematic", label: "Cinematic", filter: "teal & orange", speed: 1, hint: "Film-grade contrast and colour" },
  { id: "goldlux", label: "Gold Lux", filter: "gold hour", speed: 1, hint: "Warm luxury glow" },
  { id: "slowmo", label: "Slow motion", speed: 0.5, hint: "Half speed" },
  { id: "doubletime", label: "Double time", speed: 2, hint: "2x speed" },
  { id: "rampin", label: "Speed ramp", speed: 1.6, filter: "contrast" in FILTERS ? "contrast" : "bleach", hint: "Fast push with punchy contrast" },
  { id: "noir", label: "Noir", filter: "noir", hint: "Black and white, high contrast" },
  { id: "dream", label: "Dream", filter: "dreamy", speed: 0.75, hint: "Soft, floaty look" },
  { id: "ghost", label: "Ghost overlay", opacity: 0.45, filter: "violet dusk", hint: "Semi-transparent overlay" },
  { id: "alarm", label: "Crimson alert", filter: "crimson", speed: 1.15, hint: "Urgent red grade" },
  { id: "reset", label: "Reset", filter: "none", speed: 1, opacity: 1, hint: "Back to source" },
];
