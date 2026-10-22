import { useRef, useState } from "react";
import { generateVideo } from "@/lib/generate";

type Props = { onAsset: (url: string, kind: "image" | "video", name: string) => void };
export function PerformanceStudio({ onAsset }: Props) {
  const [mode, setMode] = useState<"omnihuman" | "motion">("omnihuman");
  const [image, setImage] = useState<File>();
  const [audio, setAudio] = useState<File>();
  const [reference, setReference] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [job, setJob] = useState<{ id: string; mode: "omnihuman" | "motion" } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  async function run(resume: boolean) {
    if (locked.current) return;
    if (!resume && (!image || (mode === "omnihuman" ? !audio : !reference))) {
      setStatus("Choose a character image and the required audio or reference video.");
      return;
    }
    if (
      [image, audio, reference].some(
        (file) => file && file.size > (file === image ? 10 : 20) * 1024 * 1024,
      )
    ) {
      setStatus("Use an image under 10 MB and audio/video under 20 MB.");
      return;
    }
    locked.current = true;
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const engine = resume && job ? job.mode : mode;
    if (!resume) setJob(null);
    setStatus("Submitting performance job…");
    try {
      const url = await generateVideo("Character performance", engine, "", {
        ...(resume && job ? { jobId: job.id } : { image, audio, referenceVideo: reference }),
        signal: abort.signal,
        onJob: async (id) => {
          setJob({ id, mode: engine });
        },
        onStatus: (state) => setStatus(`Performance: ${state}`),
      });
      onAsset(
        url,
        "video",
        engine === "omnihuman" ? "OmniHuman performance.mp4" : "Kling motion transfer.mp4",
      );
      setJob(null);
      setStatus("Finished. Your performance is in the media bin; add it to the timeline.");
    } catch (error) {
      setStatus(
        abort.signal.aborted
          ? "Paused. Submitted provider jobs may continue. Resume to retrieve the same job."
          : error instanceof Error
            ? error.message
            : "Performance failed.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <details className="mx-3 mt-3 rounded-xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Character performance · lip sync & motion transfer
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        OmniHuman animates a character image to your speech/song. Kling copies movement from your
        reference video. Uses fal credits and your studio access code.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
        <label>
          Task
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as "omnihuman" | "motion")}
            className="mt-1 block rounded border border-border bg-background p-2"
          >
            <option value="omnihuman">OmniHuman 1.5 · image + audio</option>
            <option value="motion">Kling 3 · image + reference motion</option>
          </select>
        </label>
        <label>
          Character image
          <input
            disabled={busy}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setImage(e.target.files?.[0])}
            className="mt-1 block max-w-52"
          />
        </label>
        {mode === "omnihuman" ? (
          <label>
            Speech / song audio
            <input
              disabled={busy}
              type="file"
              accept="audio/*"
              onChange={(e) => setAudio(e.target.files?.[0])}
              className="mt-1 block max-w-52"
            />
          </label>
        ) : (
          <label>
            Reference movement
            <input
              disabled={busy}
              type="file"
              accept="video/*"
              onChange={(e) => setReference(e.target.files?.[0])}
              className="mt-1 block max-w-52"
            />
          </label>
        )}
        <button
          disabled={busy}
          onClick={() => void run(false)}
          className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-40"
        >
          Generate performance
        </button>
        {busy ? (
          <button
            onClick={() => controller.current?.abort()}
            className="rounded-lg border border-border p-2"
          >
            Pause
          </button>
        ) : (
          job && (
            <button onClick={() => void run(true)} className="rounded-lg border border-border p-2">
              Resume submitted job
            </button>
          )
        )}
      </div>
      {status && (
        <p role="status" aria-live="polite" className="mt-3 text-xs text-muted-foreground">
          {status}
        </p>
      )}
    </details>
  );
}
