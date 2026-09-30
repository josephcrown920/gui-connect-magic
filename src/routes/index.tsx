import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard, Send, Loader2, Play, Pause, Scissors, MousePointer2, Upload, Plus, Trash2,
  ZoomIn, ZoomOut, Sparkles, Volume2, Eye, Gauge, Wand2, SkipBack, Download, Film,
} from "lucide-react";
import { AGENTS, TRACKS, TRACK_LABEL, agentById, type AgentAction, type TrackId } from "@/lib/agents";
import {
  IMAGE_ENGINES, VIDEO_ENGINES, DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE,
  CAMERA_MOVES, MOTION_CURVES, DEFAULT_MOTION, motionPhrase, FILTERS, PRESETS,
  type Motion,
} from "@/lib/engines";
import { generateImage, generateVideo } from "@/lib/generate";
import { renderTimeline, download } from "@/lib/export";
import { NodeCanvas } from "@/components/NodeCanvas";
import { cn } from "@/lib/utils";
import scene1 from "@/assets/scene1.jpg";
import scene2 from "@/assets/scene2.jpg";
import scene3 from "@/assets/scene3.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel — AI Co-Editor Video Studio" },
      { name: "description", content: "Drop your footage, tell your AI co-editor what you want, and cut it together on a real multi-track timeline." },
      { property: "og:title", content: "Reel — AI Co-Editor Video Studio" },
      { property: "og:description", content: "Drop your footage, tell your AI co-editor what you want, and cut it together on a real multi-track timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Editor,
});

type Kind = "video" | "image" | "audio";
type Asset = { id: string; name: string; kind: Kind; url: string; dur: number };
type Clip = {
  id: string; assetId: string; track: TrackId; start: number; dur: number; inPoint: number;
  name: string; volume: number; opacity: number; speed: number; filter: string;
};
type Msg = { role: "user" | "assistant"; text: string; steps?: string[]; agent?: string };

const uid = () => Math.random().toString(36).slice(2, 8);
const tc = (s: number) => {
  const f = Math.floor((s % 1) * 24);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

const DEMO: Asset[] = [
  { id: "a1", name: "neon_street.jpg", kind: "image", url: scene1, dur: 4 },
  { id: "a2", name: "raincoat_look.jpg", kind: "image", url: scene2, dur: 3 },
  { id: "a3", name: "dawn_skyline.jpg", kind: "image", url: scene3, dur: 5 },
];

const RECIPES = [
  "Build a 12s teaser from my rushes",
  "Cut the dead air and tighten the pacing",
  "Add b-roll on V2 over the talking head",
  "Make the ending feel hopeful",
];

function Editor() {
  const [assets, setAssets] = useState<Asset[]>(DEMO);
  const [clips, setClips] = useState<Clip[]>([
    { id: "c1", assetId: "a1", track: "V1", start: 0, dur: 4, inPoint: 0, name: "neon_street", volume: 1, opacity: 1, speed: 1, filter: "none" },
    { id: "c2", assetId: "a2", track: "V1", start: 4, dur: 3, inPoint: 0, name: "raincoat_look", volume: 1, opacity: 1, speed: 1, filter: "none" },
    { id: "c3", assetId: "a3", track: "V1", start: 7, dur: 5, inPoint: 0, name: "dawn_skyline", volume: 1, opacity: 1, speed: 1, filter: "none" },
  ]);
  const [sel, setSel] = useState<string | null>("c1");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(46);
  const [tool, setTool] = useState<"select" | "razor">("select");
  const [agent, setAgent] = useState("astra");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", agent: "astra", text: "I'm your co-editor. Drop your footage in the bin on the left, then tell me the cut you want — I'll lay it on the timeline and we iterate from there." },
  ]);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [mode, setMode] = useState<"edit" | "canvas">("edit");
  const [imgEngine, setImgEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [vidEngine, setVidEngine] = useState(DEFAULT_VIDEO_ENGINE);
  const [motion, setMotion] = useState<Motion>(DEFAULT_MOTION);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const laneRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const duration = useMemo(() => Math.max(12, ...clips.map((c) => c.start + c.dur)), [clips]);
  const assetOf = useCallback((id: string) => assets.find((a) => a.id === id), [assets]);
  const selected = clips.find((c) => c.id === sel) ?? null;

  const videoClip = useMemo(() => {
    for (const t of ["V3", "V2", "V1"] as TrackId[]) {
      const c = clips.find((x) => x.track === t && playhead >= x.start && playhead < x.start + x.dur);
      if (c && assetOf(c.assetId)?.kind !== "audio") return c;
    }
    return null;
  }, [clips, playhead, assetOf]);

  const audioClip = useMemo(
    () => clips.find((x) => (x.track === "A1" || x.track === "A2") && playhead >= x.start && playhead < x.start + x.dur) ?? null,
    [clips, playhead],
  );

  // transport
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const d = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const next = p + d;
        if (next >= duration) { setPlaying(false); return duration; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  // keep media elements in sync
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoClip) return;
    const want = videoClip.inPoint + (playhead - videoClip.start);
    if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = Math.max(0, want);
    v.playbackRate = videoClip.speed;
    v.volume = videoClip.volume;
    if (playing) void v.play().catch(() => {}); else v.pause();
  }, [playing, videoClip, playhead]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audioClip) return;
    const want = audioClip.inPoint + (playhead - audioClip.start);
    if (Math.abs(a.currentTime - want) > 0.3) a.currentTime = Math.max(0, want);
    a.volume = audioClip.volume;
    if (playing) void a.play().catch(() => {}); else a.pause();
  }, [playing, audioClip, playhead]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  /* ---------- media bin ---------- */
  async function ingest(files: FileList | null) {
    if (!files) return;
    const added: Asset[] = [];
    for (const f of Array.from(files)) {
      const kind: Kind = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
      const url = URL.createObjectURL(f);
      const dur = kind === "image" ? 4 : await probe(url, kind);
      added.push({ id: uid(), name: f.name, kind, url, dur });
    }
    setAssets((a) => [...a, ...added]);
    if (added.length) {
      setMsgs((m) => [...m, { role: "assistant", agent, text: `Logged ${added.length} new ${added.length === 1 ? "file" : "files"} in the bin. Tell me the cut you're after.`, steps: added.map((a) => `Ingested ${a.name} · ${a.dur.toFixed(1)}s`) }]);
    }
  }

  function probe(url: string, kind: Kind) {
    return new Promise<number>((res) => {
      const el = document.createElement(kind === "audio" ? "audio" : "video");
      el.preload = "metadata";
      el.onloadedmetadata = () => res(Number.isFinite(el.duration) ? el.duration : 5);
      el.onerror = () => res(5);
      el.src = url;
    });
  }

  function addToTimeline(asset: Asset, track?: TrackId) {
    const t: TrackId = track ?? (asset.kind === "audio" ? "A2" : "V1");
    const end = clips.filter((c) => c.track === t).reduce((m, c) => Math.max(m, c.start + c.dur), 0);
    setClips((cs) => [...cs, { id: uid(), assetId: asset.id, track: t, start: end, dur: asset.dur, inPoint: 0, name: asset.name.replace(/\.[^.]+$/, ""), volume: 1, opacity: 1, speed: 1, filter: "none" }]);
  }

  async function generateBroll() {
    const p = brief.trim() || "cinematic b-roll insert, shallow depth of field, moody light";
    setGenBusy(true);
    try {
      const url = await generateImage(p, imgEngine);
      const a: Asset = { id: uid(), name: `gen_${uid()}.png`, kind: "image", url, dur: 4 };
      setAssets((x) => [...x, a]);
      setMsgs((m) => [...m, { role: "assistant", agent, text: "Generated a b-roll plate and dropped it in the bin.", steps: [`Generated "${p.slice(0, 48)}"`] }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", agent, text: `Couldn't generate that plate — ${e instanceof Error ? e.message : "the AI service didn't return an image."}` }]);
    } finally {
      setGenBusy(false);
    }
  }

  async function generateClip() {
    const p = brief.trim() || "cinematic motion shot, moody light";
    setGenBusy(true);
    try {
      const url = await generateVideo(p, vidEngine, motionPhrase(motion), { onStatus: (s) => setMsgs((m) => [...m.slice(0, -1), { ...m[m.length - 1]!, text: `Rendering video… ${s}` }]) });
      const a: Asset = { id: uid(), name: `clip_${uid()}.mp4`, kind: "video", url, dur: 6 };
      setAssets((x) => [...x, a]);
      setMsgs((m) => [...m, { role: "assistant", agent, text: "Rendered a video clip and dropped it in the bin.", steps: [`Motion: ${motionPhrase(motion)}`] }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", agent, text: `Video render failed — ${e instanceof Error ? e.message : "unknown error"}` }]);
    } finally {
      setGenBusy(false);
    }
  }

  function addAsset(url: string, kind: "image" | "video", name: string) {
    setAssets((x) => [...x, { id: uid(), name, kind, url, dur: kind === "video" ? 6 : 4 }]);
    setMsgs((m) => [...m, { role: "assistant", agent, text: `Pulled ${name} from the canvas into the bin.` }]);
  }

  async function exportVideo() {
    if (!clips.length || exporting) return;
    setPlaying(false);
    setExporting(true);
    setExportPct(0);
    try {
      const blob = await renderTimeline(
        clips.map((c) => ({ assetId: c.assetId, track: c.track, start: c.start, dur: c.dur, inPoint: c.inPoint, opacity: c.opacity, speed: c.speed, volume: c.volume, filterCss: FILTERS[c.filter] ?? "none" })),
        assets.map((a) => ({ id: a.id, kind: a.kind, url: a.url })),
        duration,
        setExportPct,
      );
      download(blob, "reel-edit.webm");
      setMsgs((m) => [...m, { role: "assistant", agent, text: "Exported your cut as a WebM file — check your downloads." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", agent, text: "Export failed — your browser may not support recording. Try Chrome or Edge." }]);
    } finally {
      setExporting(false);
    }
  }

  /* ---------- timeline editing ---------- */
  function applyActions(actions: AgentAction[]) {
    setClips((cs) => {
      let next = [...cs];
      for (const a of actions) {
        if (a.op === "add") {
          const asset = assets.find((x) => x.id === a.assetId);
          if (!asset) continue;
          next.push({ id: uid(), assetId: asset.id, track: a.track ?? "V1", start: Math.max(0, a.start ?? 0), dur: Math.max(0.3, a.dur ?? asset.dur), inPoint: 0, name: a.name ?? asset.name.replace(/\.[^.]+$/, ""), volume: 1, opacity: 1, speed: 1, filter: "none" });
        } else if (a.op === "remove") {
          next = next.filter((c) => c.id !== a.clipId);
        } else if (a.op === "trim") {
          next = next.map((c) => (c.id === a.clipId ? { ...c, dur: Math.max(0.3, a.dur) } : c));
        } else if (a.op === "move") {
          next = next.map((c) => (c.id === a.clipId ? { ...c, track: a.track ?? c.track, start: Math.max(0, a.start ?? c.start) } : c));
        } else if (a.op === "split") {
          const c = next.find((x) => x.id === a.clipId);
          if (!c) continue;
          const off = Math.min(Math.max(0.2, a.at), c.dur - 0.2);
          next = next.flatMap((x) => (x.id !== c.id ? [x] : [
            { ...x, dur: off },
            { ...x, id: uid(), start: x.start + off, dur: x.dur - off, inPoint: x.inPoint + off },
          ]));
        } else if (a.op === "set") {
          next = next.map((c) => (c.id === a.clipId ? {
            ...c,
            volume: a.volume ?? c.volume, opacity: a.opacity ?? c.opacity,
            speed: a.speed ?? c.speed, filter: a.filter ?? c.filter,
          } : c));
        }
      }
      return next;
    });
  }

  function splitAt(clip: Clip, at: number) {
    const off = at - clip.start;
    if (off <= 0.2 || off >= clip.dur - 0.2) return;
    setClips((cs) => cs.flatMap((x) => (x.id !== clip.id ? [x] : [
      { ...x, dur: off },
      { ...x, id: uid(), start: x.start + off, dur: x.dur - off, inPoint: x.inPoint + off },
    ])));
  }

  function onClipPointerDown(e: React.PointerEvent, clip: Clip) {
    e.stopPropagation();
    const lane = laneRef.current;
    if (!lane) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offX = e.clientX - rect.left;
    if (tool === "razor") {
      splitAt(clip, clip.start + offX / zoom);
      return;
    }
    setSel(clip.id);
    const mode = offX < 10 ? "left" : offX > rect.width - 10 ? "right" : "move";
    const startClip = { ...clip };
    const originX = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - originX) / zoom;
      setClips((cs) => cs.map((c) => {
        if (c.id !== clip.id) return c;
        if (mode === "move") return { ...c, start: Math.max(0, startClip.start + d) };
        if (mode === "left") {
          const delta = Math.min(Math.max(d, -startClip.start), startClip.dur - 0.3);
          return { ...c, start: startClip.start + delta, dur: startClip.dur - delta, inPoint: Math.max(0, startClip.inPoint + delta) };
        }
        return { ...c, dur: Math.max(0.3, startClip.dur + d) };
      }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function scrub(e: React.PointerEvent) {
    const lane = laneRef.current;
    if (!lane) return;
    const seek = (clientX: number) => {
      const x = clientX - lane.getBoundingClientRect().left + lane.scrollLeft;
      setPlayhead(Math.min(duration, Math.max(0, x / zoom)));
    };
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- agent ---------- */
  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setBrief("");
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setBusy(true);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent, brief: t,
          history: msgs.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          assets: assets.map((a) => ({ id: a.id, name: a.name, kind: a.kind, dur: a.dur })),
          clips: clips.map((c) => ({ id: c.id, assetId: c.assetId, track: c.track, start: c.start, dur: c.dur })),
        }),
      });
      const d = (await r.json()) as { reply: string; steps: string[]; actions: AgentAction[] };
      if (d.actions?.length) applyActions(d.actions);
      setMsgs((m) => [...m, { role: "assistant", agent, text: d.reply, steps: d.steps }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", agent, text: "I lost connection to the editing brain. Try that again." }]);
    } finally {
      setBusy(false);
    }
  }

  const active = agentById(agent);
  const previewAsset = videoClip ? assetOf(videoClip.assetId) : null;
  const audioAsset = audioClip ? assetOf(audioClip.assetId) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      {/* top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="size-4" /></div>
          <span className="font-display text-base font-bold tracking-tight">Reel</span>
          <span className="hidden rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground sm:inline">Semantic editor 1.1</span>
        </div>
        <button onClick={() => setPickerOpen((o) => !o)} className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs transition hover:border-primary">
          <span className="grid size-5 place-items-center rounded-full font-mono text-[9px] font-bold text-primary-foreground" style={{ background: active.accent }}>{active.short}</span>
          <span className="font-medium">{active.name}</span>
          <Sparkles className="size-3 text-muted-foreground" />
        </button>
      </header>

      {pickerOpen && (
        <div className="animate-rise border-b border-border bg-card p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Choose your co-editor</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((a) => (
              <button
                key={a.id}
                disabled={!a.available}
                onClick={() => { setAgent(a.id); setPickerOpen(false); setMsgs((m) => [...m, { role: "assistant", agent: a.id, text: `${a.name} here — ${a.role.toLowerCase()}. Where do you want to take this cut?` }]); }}
                className={cn("flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition", a.id === agent ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground", !a.available && "opacity-40")}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold text-primary-foreground" style={{ background: a.accent }}>{a.short}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{a.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.available ? a.role : "Not available here yet"}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="grid flex-1 gap-3 p-3 lg:grid-cols-[260px_1fr_240px]">
        {/* media bin */}
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Media bin</h2>
            <span className="font-mono text-[10px] text-muted-foreground">{assets.length}</span>
          </div>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void ingest(e.dataTransfer.files); }}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            <Upload className="size-3.5" /> Drop footage, music or VO
            <input type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => void ingest(e.target.files)} />
          </label>
          <button onClick={() => void generateBroll()} disabled={genBusy} className="flex items-center justify-center gap-2 rounded-lg bg-secondary py-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50">
            {genBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} Generate b-roll plate
          </button>
          <div className="grid max-h-[220px] grid-cols-2 gap-2 overflow-y-auto lg:max-h-none lg:grid-cols-1">
            {assets.map((a) => (
              <div key={a.id} className="group flex items-center gap-2 rounded-lg border border-border p-1.5">
                <div className="grid h-9 w-14 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                  {a.kind === "audio" ? <Volume2 className="size-4 text-muted-foreground" /> : a.kind === "video"
                    ? <video src={a.url} muted className="h-full w-full object-cover" />
                    : <img src={a.url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium">{a.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{a.dur.toFixed(1)}s · {a.kind}</p>
                </div>
                <button onClick={() => addToTimeline(a)} className="grid size-6 shrink-0 place-items-center rounded bg-secondary text-muted-foreground transition hover:bg-primary hover:text-primary-foreground"><Plus className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </section>

        {/* monitor + timeline */}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative grid aspect-video place-items-center bg-black">
              {previewAsset && videoClip ? (
                previewAsset.kind === "video" ? (
                  <video ref={videoRef} key={videoClip.id} src={previewAsset.url} playsInline className="h-full w-full object-contain" style={{ filter: FILTERS[videoClip.filter] ?? "none", opacity: videoClip.opacity }} />
                ) : (
                  <img src={previewAsset.url} alt="" className="h-full w-full object-contain" style={{ filter: FILTERS[videoClip.filter] ?? "none", opacity: videoClip.opacity }} />
                )
              ) : (
                <p className="font-mono text-xs text-muted-foreground">No clip under the playhead</p>
              )}
              {audioAsset && <audio ref={audioRef} key={audioClip?.id} src={audioAsset.url} className="hidden" />}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-3 py-2">
              <button onClick={() => { setPlaying(false); setPlayhead(0); }} className="text-muted-foreground transition hover:text-foreground"><SkipBack className="size-4" /></button>
              <button onClick={() => setPlaying((p) => !p)} className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <span className="font-mono text-xs text-primary">{tc(playhead)}</span>
              <span className="font-mono text-xs text-muted-foreground">/ {tc(duration)}</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setTool("select")} className={cn("grid size-7 place-items-center rounded transition", tool === "select" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}><MousePointer2 className="size-3.5" /></button>
                <button onClick={() => setTool("razor")} className={cn("grid size-7 place-items-center rounded transition", tool === "razor" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}><Scissors className="size-3.5" /></button>
                <button onClick={() => setZoom((z) => Math.max(18, z - 10))} className="grid size-7 place-items-center rounded text-muted-foreground transition hover:bg-secondary"><ZoomOut className="size-3.5" /></button>
                <button onClick={() => setZoom((z) => Math.min(160, z + 10))} className="grid size-7 place-items-center rounded text-muted-foreground transition hover:bg-secondary"><ZoomIn className="size-3.5" /></button>
              </div>
            </div>
          </div>

          {/* timeline */}
          <div className="flex min-h-[240px] flex-1 overflow-hidden rounded-xl border border-border bg-card">
            <div className="w-16 shrink-0 border-r border-border">
              <div className="h-6 border-b border-border" />
              {TRACKS.map((t) => (
                <div key={t} title={TRACK_LABEL[t]} className="flex h-11 items-center justify-center border-b border-border font-mono text-[10px] text-muted-foreground">{t}</div>
              ))}
            </div>
            <div className="relative flex-1 overflow-x-auto" ref={laneRef}>
              <div style={{ width: Math.max(duration + 6, 20) * zoom }} className="relative">
                <div onPointerDown={scrub} className="sticky top-0 z-20 h-6 cursor-col-resize border-b border-border bg-card">
                  {Array.from({ length: Math.ceil(duration) + 6 }).map((_, i) => (
                    <span key={i} className="absolute top-0 h-full border-l border-border/60 pl-1 font-mono text-[9px] leading-6 text-muted-foreground" style={{ left: i * zoom }}>{i % 2 === 0 ? `${i}s` : ""}</span>
                  ))}
                </div>
                {TRACKS.map((t) => (
                  <div key={t} className="relative h-11 border-b border-border" onPointerDown={() => setSel(null)}>
                    {clips.filter((c) => c.track === t).map((c) => {
                      const a = assetOf(c.assetId);
                      const isAudio = t === "A1" || t === "A2";
                      return (
                        <div
                          key={c.id}
                          onPointerDown={(e) => onClipPointerDown(e, c)}
                          className={cn("absolute top-1 flex h-9 items-center overflow-hidden rounded-md border text-[10px] select-none",
                            sel === c.id ? "border-primary ring-1 ring-primary" : "border-border",
                            tool === "razor" ? "cursor-crosshair" : "cursor-grab")}
                          style={{ left: c.start * zoom, width: Math.max(12, c.dur * zoom), background: isAudio ? "color-mix(in oklab, var(--chart-4) 28%, var(--card))" : "color-mix(in oklab, var(--chart-2) 26%, var(--card))" }}
                        >
                          <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/10" />
                          {a && !isAudio && a.kind === "image" && <img src={a.url} alt="" className="h-full w-10 shrink-0 object-cover opacity-70" />}
                          <span className="truncate px-1.5 font-mono">{c.name}</span>
                          <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/10" />
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-primary" style={{ left: playhead * zoom }}>
                  <span className="absolute -top-0 -left-1 size-2 rotate-45 bg-primary" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* inspector */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Inspector</h2>
          {selected ? (
            <div className="space-y-3 text-xs">
              <p className="truncate font-semibold">{selected.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{selected.track} · {tc(selected.start)} → {tc(selected.start + selected.dur)}</p>
              <Slider icon={<Volume2 className="size-3" />} label="Volume" value={selected.volume} min={0} max={1} step={0.05} onChange={(v) => setClips((cs) => cs.map((c) => (c.id === selected.id ? { ...c, volume: v } : c)))} />
              <Slider icon={<Eye className="size-3" />} label="Opacity" value={selected.opacity} min={0.1} max={1} step={0.05} onChange={(v) => setClips((cs) => cs.map((c) => (c.id === selected.id ? { ...c, opacity: v } : c)))} />
              <Slider icon={<Gauge className="size-3" />} label="Speed" value={selected.speed} min={0.25} max={2} step={0.05} onChange={(v) => setClips((cs) => cs.map((c) => (c.id === selected.id ? { ...c, speed: v } : c)))} />
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">Look</p>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(FILTERS).map((f) => (
                    <button key={f} onClick={() => setClips((cs) => cs.map((c) => (c.id === selected.id ? { ...c, filter: f } : c)))} className={cn("rounded-full border px-2 py-0.5 text-[10px] capitalize transition", selected.filter === f ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => splitAt(selected, playhead)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-secondary py-1.5 text-[11px] transition hover:bg-muted"><Scissors className="size-3" /> Split</button>
                <button onClick={() => { setClips((cs) => cs.filter((c) => c.id !== selected.id)); setSel(null); }} className="flex items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-1.5 text-[11px] text-destructive transition hover:bg-muted"><Trash2 className="size-3" /></button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Select a clip on the timeline to adjust it.</p>
          )}
        </section>

        {/* chat co-editor */}
        <section className="flex flex-col rounded-xl border border-border bg-card lg:col-span-3">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="grid size-5 place-items-center rounded-full font-mono text-[9px] font-bold text-primary-foreground" style={{ background: active.accent }}>{active.short}</span>
            <span className="text-xs font-semibold">{active.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{active.role}</span>
          </div>
          <div className="max-h-[300px] flex-1 space-y-3 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <div key={i} className={cn("animate-rise text-sm leading-relaxed", m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground" : "max-w-[92%]")}>
                <p>{m.text}</p>
                {m.steps && m.steps.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg border border-border bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
                    {m.steps.map((s, j) => <li key={j}>› {s}</li>)}
                  </ul>
                )}
              </div>
            ))}
            {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {active.name} is working the timeline…</p>}
            <div ref={chatEnd} />
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {RECIPES.map((r) => (
              <button key={r} onClick={() => void send(r)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-foreground">{r}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(brief); }} className="flex items-center gap-2 border-t border-border p-2.5">
            <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Tell your co-editor what to cut…" className="flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" />
            <button type="submit" disabled={busy || !brief.trim()} className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-4" /></button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Slider({ icon, label, value, min, max, step, onChange }: { icon: React.ReactNode; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">{icon}{label}<span className="ml-auto font-mono">{value.toFixed(2)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
    </label>
  );
}
