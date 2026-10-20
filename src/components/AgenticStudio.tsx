import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Square, RotateCcw } from "lucide-react";
import {
  executeProduction,
  assembleScenes,
  validatePlan,
  type ProductionMedia,
  type ProductionRun,
} from "@/lib/production";
import { generateImage, generateVideo } from "@/lib/generate";
import {
  saveProductionMedia,
  saveProductionRun,
  restoreProductionRun,
} from "@/lib/production-store";

type Props = {
  assets: ProductionMedia[];
  imageEngine: string;
  videoEngine: string;
  disabled: boolean;
  onAssemble: (assets: ProductionMedia[], clips: ReturnType<typeof assembleScenes>) => void;
};
export function AgenticStudio({ assets, imageEngine, videoEngine, disabled, onAssemble }: Props) {
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<"image" | "video">("image");
  const [run, setRun] = useState<ProductionRun | null>(null);
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState(
    "Describe your video. I’ll plan the scenes and assemble a first cut.",
  );
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void restoreProductionRun()
      .then((saved) => {
        if (!mounted.current || !saved) return;
        setRun(saved);
        setBrief(saved.brief);
        setKind(saved.kind);
        setStatus("Saved production restored. Resume unfinished scenes or load the finished cut.");
      })
      .catch(() => {
        if (mounted.current) setStorageWarning("Draft recovery is unavailable on this device.");
      })
      .finally(() => {
        if (mounted.current) setRestoring(false);
      });
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  async function checkpoint(current: ProductionRun, media?: ProductionMedia) {
    if (mounted.current)
      setRun({ ...current, media: { ...current.media }, jobs: { ...current.jobs } });
    try {
      if (media) await saveProductionMedia(media);
      await saveProductionRun(current);
    } catch {
      if (mounted.current)
        setStorageWarning(
          "Device storage is full or unavailable. Keep this tab open; this production may not survive a reload.",
        );
    }
  }

  async function produce(resume: boolean) {
    if (locked.current || disabled || restoring || (!resume && !brief.trim())) return;
    locked.current = true;
    setRunning(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    let current = resume ? run : null;
    try {
      if (!current) {
        setStatus(
          "Director is writing the storyboard; reviewer is checking continuity and pacing…",
        );
        const sources = [
          ...new Map(
            [...assets, ...Object.values(run?.media ?? {})].map((a) => [a.id, a]),
          ).values(),
        ];
        const response = await fetch("/api/agent", {
          method: "POST",
          signal: abort.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "production",
            brief: brief.trim(),
            assets: sources.map(({ url: _url, ...a }) => a),
            ...(run ? { previousPlan: run.plan } : {}),
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          plan?: unknown;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? `Planning failed (${response.status}).`);
        const plan = validatePlan(result.plan, sources);
        // Only persist the sources this plan actually uses.
        const used = sources.filter((a) =>
          plan.scenes.some((s) => s.source === "existing" && s.assetId === a.id),
        );
        for (const asset of used) {
          abort.signal.throwIfAborted();
          await saveProductionMedia(asset).catch(() =>
            setStorageWarning("Source media could not be saved for recovery."),
          );
        }
        current = {
          id: crypto.randomUUID(),
          brief: brief.trim(),
          plan,
          sources: used,
          media: {},
          jobs: {},
          kind,
          engine: kind === "image" ? imageEngine : videoEngine,
        };
        await checkpoint(current);
      }
      const activeRun = current;
      const assembled = await executeProduction(current, {
        signal: abort.signal,
        status: (scene, i) =>
          setStatus(`Scene ${i + 1}/${activeRun.plan.scenes.length}: ${scene.title}`),
        checkpoint,
        generate: async (scene) => {
          const url =
            activeRun.kind === "image"
              ? await generateImage(scene.prompt, activeRun.engine, undefined, abort.signal)
              : await generateVideo(scene.prompt, activeRun.engine, "", {
                  duration: "8s",
                  signal: abort.signal,
                  ...(activeRun.jobs[scene.id] ? { jobId: activeRun.jobs[scene.id] } : {}),
                  onJob: async (id) => {
                    activeRun.jobs[scene.id] = id;
                    await checkpoint(activeRun);
                  },
                  onStatus: (state) => setStatus(`${scene.title} — ${state}`),
                });
          return {
            id: `${activeRun.id}-${scene.id}`,
            name: scene.title,
            kind: activeRun.kind,
            url,
            dur: activeRun.kind === "video" ? 8 : scene.duration,
          };
        },
      });
      onAssemble(Object.values(current.media), assembled);
      setStatus(
        "First cut assembled. Preview it below, describe a revision, or export with the Export button.",
      );
    } catch (failure) {
      if (mounted.current) {
        const message = abort.signal.aborted
          ? "Production paused. Completed scenes are kept; resume when ready. A submitted provider job may continue running."
          : failure instanceof Error
            ? failure.message
            : "Production failed. Your completed scenes are kept.";
        setError(message);
        setStatus("Production stopped.");
      }
    } finally {
      locked.current = false;
      controller.current = null;
      if (mounted.current) setRunning(false);
    }
  }
  const done = run ? Object.keys(run.media).length : 0;
  return (
    <section
      className="mx-3 mt-3 rounded-xl border border-primary/40 bg-card p-4"
      aria-label="Agentic video production"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" /> Brief to video
        </h2>
        <span className="text-xs text-muted-foreground">
          Director → reviewer → media generation → timeline
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Create a visual first cut up to 60 seconds. Uses AI credits. Narration below is a script;
        voiceover and music are not generated.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void produce(false);
        }}
        className="mt-3 space-y-2"
      >
        <textarea
          aria-label="Video brief or revision"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={running || restoring}
          maxLength={6000}
          placeholder="Make a 30-second cinematic launch video for my clothing brand. Open with city life, show the collection, finish with a strong call to action…"
          className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Generated scene format"
            value={kind}
            disabled={running}
            onChange={(e) => setKind(e.target.value as "image" | "video")}
            className="rounded-lg border border-border bg-background p-2 text-xs"
          >
            <option value="image">Image storyboard · lower cost</option>
            <option value="video">Generated video clips · up to 10 paid jobs</option>
          </select>
          <button
            disabled={running || restoring || disabled || !brief.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {run ? "Create revised cut" : "Create video"}
          </button>
          {running ? (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="flex items-center gap-1 rounded-lg border border-border p-2 text-xs"
            >
              <Square className="size-3" /> Pause
            </button>
          ) : (
            run && (
              <button
                type="button"
                disabled={disabled || restoring}
                onClick={() => void produce(true)}
                className="flex items-center gap-1 rounded-lg border border-border p-2 text-xs"
              >
                <RotateCcw className="size-3" />{" "}
                {done === run.plan.scenes.length ? "Load saved cut" : "Resume production"}
              </button>
            )
          )}
        </div>
      </form>
      <p
        role="status"
        aria-live="polite"
        className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
      >
        {(running || restoring) && <Loader2 className="size-3 animate-spin" />}
        {restoring ? "Restoring saved production…" : status}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {storageWarning && <p className="mt-2 text-xs text-amber-500">{storageWarning}</p>}
      {run && (
        <div className="mt-3">
          <h3 className="text-sm font-medium">
            {run.plan.title} · {done}/{run.plan.scenes.length} scenes ready
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{run.plan.summary}</p>
          <ol className="mt-2 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {run.plan.scenes.map((scene, i) => (
              <li key={scene.id} className="rounded-lg border border-border p-2 text-xs">
                <p className="font-medium">
                  {i + 1}. {scene.title} · {scene.duration}s ·{" "}
                  {run.media[scene.id] ? "Ready" : run.jobs[scene.id] ? "Submitted" : "Pending"}
                </p>
                {scene.narration && (
                  <p className="mt-1 text-muted-foreground">Script: {scene.narration}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
