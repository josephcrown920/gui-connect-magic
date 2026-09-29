import { useEffect, useRef, useState } from "react";
import { Type, ImageUp, ImageIcon, Film, Plus, Minus, Maximize, Play, Loader2, Trash2, FolderInput, Hand, MousePointer2 } from "lucide-react";
import { IMAGE_ENGINES, VIDEO_ENGINES, DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, motionPhrase, type Motion } from "@/lib/engines";
import { generateImage, generateVideo, urlToBlob } from "@/lib/generate";
import { cn } from "@/lib/utils";

type NodeType = "prompt" | "upload" | "image" | "video";
type Node = {
  id: string; type: NodeType; x: number; y: number;
  text?: string | undefined; url?: string | undefined; engine?: string | undefined;
  busy?: boolean; status?: string | undefined; error?: string | undefined;
};
type Edge = { from: string; to: string };

const W = 240;
const META: Record<NodeType, { label: string; icon: typeof Type; out: "text" | "image" | "video" }> = {
  prompt: { label: "Prompt", icon: Type, out: "text" },
  upload: { label: "Image upload", icon: ImageUp, out: "image" },
  image: { label: "Image · Generate / Edit", icon: ImageIcon, out: "image" },
  video: { label: "Video · Animate", icon: Film, out: "video" },
};

const uid = () => Math.random().toString(36).slice(2, 8);

const START: { nodes: Node[]; edges: Edge[] } = {
  nodes: [
    { id: "p1", type: "prompt", x: 40, y: 40, text: "A model holding a gold perfume bottle among white roses, soft purple dusk light, editorial" },
    { id: "u1", type: "upload", x: 40, y: 290 },
    { id: "i1", type: "image", x: 360, y: 60, engine: DEFAULT_IMAGE_ENGINE },
    { id: "p2", type: "prompt", x: 360, y: 360, text: "She turns to camera and smiles, petals drift" },
    { id: "v1", type: "video", x: 680, y: 160, engine: DEFAULT_VIDEO_ENGINE },
  ],
  edges: [{ from: "p1", to: "i1" }, { from: "u1", to: "i1" }, { from: "i1", to: "v1" }, { from: "p2", to: "v1" }],
};

export function NodeCanvas({ motion, onAsset }: { motion: Motion; onAsset: (url: string, kind: "image" | "video", name: string) => void }) {
  const [nodes, setNodes] = useState<Node[]>(START.nodes);
  const [edges, setEdges] = useState<Edge[]>(START.edges);
  const [view, setView] = useState({ x: 20, y: 20, z: 0.8 });
  const [linking, setLinking] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "pan">("select");
  const wrap = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const heights = useRef<Record<string, number>>({});
  const [, force] = useState(0);

  const patch = (id: string, p: Partial<Node>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...p } : n)));

  // wheel zoom around cursor (non-passive)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) + Math.abs(dy) > 0 && e.deltaMode === 0 && !Number.isInteger(dy) === false && false) return;
      const z = Math.min(2, Math.max(0.3, v.z * Math.exp(-dy * 0.0015)));
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top, k = z / v.z;
      setView({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(f: number) {
    const el = wrap.current; if (!el) return;
    const r = el.getBoundingClientRect(); const v = view;
    const z = Math.min(2, Math.max(0.3, v.z * f)); const k = z / v.z;
    const px = r.width / 2, py = r.height / 2;
    setView({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  }

  function fit() {
    const el = wrap.current; if (!el || !nodes.length) return;
    const r = el.getBoundingClientRect();
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + W)), maxY = Math.max(...nodes.map((n) => n.y + (heights.current[n.id] ?? 200)));
    const z = Math.min(1.2, Math.max(0.3, Math.min((r.width - 40) / (maxX - minX), (r.height - 40) / (maxY - minY))));
    setView({ z, x: 20 - minX * z + (r.width - 40 - (maxX - minX) * z) / 2, y: 20 - minY * z });
  }

  useEffect(() => { const t = setTimeout(fit, 50); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function panStart(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setLinking(null);
    const sx = e.clientX, sy = e.clientY, v0 = view;
    const move = (ev: PointerEvent) => setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragNode(e: React.PointerEvent, n: Node) {
    if (mode === "pan") return panStart({ ...e, target: wrap.current! } as unknown as React.PointerEvent);
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, x0 = n.x, y0 = n.y, z = view.z;
    const move = (ev: PointerEvent) => patch(n.id, { x: x0 + (ev.clientX - sx) / z, y: y0 + (ev.clientY - sy) / z });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function addNode(type: NodeType) {
    const el = wrap.current; const r = el?.getBoundingClientRect();
    const cx = r ? (r.width / 2 - view.x) / view.z - W / 2 : 100;
    const cy = r ? (r.height / 2 - view.y) / view.z - 80 : 100;
    const n: Node = { id: uid(), type, x: cx + (Math.random() * 40 - 20), y: cy + (Math.random() * 40 - 20) };
    if (type === "prompt") n.text = "";
    if (type === "image") n.engine = DEFAULT_IMAGE_ENGINE;
    if (type === "video") n.engine = DEFAULT_VIDEO_ENGINE;
    setNodes((ns) => [...ns, n]);
  }

  function removeNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
  }

  function clickOut(id: string) { setLinking((l) => (l === id ? null : id)); }
  function clickIn(id: string) {
    if (!linking || linking === id) return;
    const from = nodes.find((n) => n.id === linking);
    const to = nodes.find((n) => n.id === id);
    if (!from || !to) return;
    if (META[from.type].out === "video") { setLinking(null); return; }
    setEdges((es) => (es.some((e) => e.from === linking && e.to === id) ? es : [...es, { from: linking, to: id }]));
    setLinking(null);
  }

  function inputs(id: string) {
    const ins = edges.filter((e) => e.to === id).map((e) => nodes.find((n) => n.id === e.from)).filter(Boolean) as Node[];
    return {
      text: ins.filter((n) => n.type === "prompt").map((n) => n.text?.trim()).filter(Boolean).join(". "),
      image: ins.find((n) => (n.type === "upload" || n.type === "image") && n.url)?.url,
    };
  }

  async function run(n: Node) {
    const { text, image } = inputs(n.id);
    if (!text) { patch(n.id, { error: "Connect a Prompt node with some text first." }); return; }
    patch(n.id, { busy: true, error: undefined, status: "Starting…" });
    try {
      if (n.type === "image") {
        const src = image ? await urlToBlob(image) : undefined;
        const url = await generateImage(text, n.engine ?? DEFAULT_IMAGE_ENGINE, src);
        patch(n.id, { url, busy: false, status: undefined });
      } else {
        const src = image ? await urlToBlob(image) : undefined;
        const url = await generateVideo(text, n.engine ?? DEFAULT_VIDEO_ENGINE, motionPhrase(motion), { image: src, onStatus: (s) => patch(n.id, { status: s }) });
        patch(n.id, { url, busy: false, status: undefined });
      }
    } catch (e) {
      patch(n.id, { busy: false, status: undefined, error: e instanceof Error ? e.message : "Generation failed" });
    }
  }

  const center = (n: Node, side: "in" | "out") => ({ x: n.x + (side === "out" ? W : 0), y: n.y + 22 });

  return (
    <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-border bg-background lg:h-[calc(100vh-120px)]">
      <div
        ref={wrap}
        onPointerDown={panStart}
        className={cn("absolute inset-0 touch-none", mode === "pan" ? "cursor-grab" : "cursor-default")}
        style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px)", backgroundSize: `${22 * view.z}px ${22 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
            {edges.map((e, i) => {
              const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const p = center(a, "out"), q = center(b, "in"), dx = Math.max(60, Math.abs(q.x - p.x) / 2);
              return <path key={i} d={`M${p.x},${p.y} C${p.x + dx},${p.y} ${q.x - dx},${q.y} ${q.x},${q.y}`} fill="none" stroke="var(--primary)" strokeOpacity={0.7} strokeWidth={2} />;
            })}
          </svg>
          {nodes.map((n) => {
            const M = META[n.type]; const Icon = M.icon;
            const engines = n.type === "image" ? IMAGE_ENGINES : VIDEO_ENGINES;
            return (
              <div
                key={n.id}
                data-node
                ref={(el) => { if (el && heights.current[n.id] !== el.offsetHeight) { heights.current[n.id] = el.offsetHeight; } }}
                className={cn("absolute rounded-xl border bg-card shadow-lg", linking === n.id ? "border-primary" : "border-border")}
                style={{ left: n.x, top: n.y, width: W }}
              >
                <div onPointerDown={(e) => dragNode(e, n)} className="flex cursor-grab items-center gap-2 border-b border-border px-3 py-2 active:cursor-grabbing">
                  <Icon className="size-3.5 text-primary" />
                  <span className="flex-1 truncate text-xs font-semibold">{M.label}</span>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeNode(n.id)} aria-label="Delete node" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
                {n.type !== "prompt" && n.type !== "upload" && (
                  <button onClick={() => clickIn(n.id)} aria-label="Connect input" className={cn("absolute -left-2 top-4 size-4 rounded-full border-2 bg-card", linking ? "border-primary animate-pulse" : "border-muted-foreground")} />
                )}
                {M.out !== "video" && (
                  <button onClick={() => clickOut(n.id)} aria-label="Connect output" className={cn("absolute -right-2 top-4 size-4 rounded-full border-2", linking === n.id ? "border-primary bg-primary" : "border-primary bg-card")} />
                )}
                <div className="space-y-2 p-3">
                  {n.type === "prompt" && (
                    <textarea value={n.text ?? ""} onChange={(e) => patch(n.id, { text: e.target.value })} rows={5} placeholder="Describe the shot…" className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs outline-none focus:border-primary" />
                  )}
                  {n.type === "upload" && (
                    <label className="block cursor-pointer">
                      {n.url ? <img src={n.url} alt="" className="aspect-video w-full rounded-md object-cover" /> : <div className="grid aspect-video place-items-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">Tap to pick from gallery</div>}
                      <span className="mt-1.5 block text-[11px] text-primary">{n.url ? "Replace" : "Choose image"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) patch(n.id, { url: URL.createObjectURL(f) }); }} />
                    </label>
                  )}
                  {(n.type === "image" || n.type === "video") && (
                    <>
                      <div className="grid aspect-video place-items-center overflow-hidden rounded-md bg-muted" style={{ backgroundImage: "repeating-conic-gradient(var(--muted) 0 25%, var(--background) 0 50%)", backgroundSize: "14px 14px" }}>
                        {n.busy ? <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{n.status}</span>
                          : n.url ? (n.type === "video" ? <video src={n.url} controls playsInline className="h-full w-full object-cover" /> : <img src={n.url} alt="" className="h-full w-full object-cover" />)
                          : null}
                      </div>
                      <select value={n.engine} onChange={(e) => patch(n.id, { engine: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                        {engines.map((en) => <option key={en.id} value={en.id} disabled={!en.available}>{en.name}{en.available ? "" : " (unavailable)"}</option>)}
                      </select>
                      {n.error && <p className="text-[10px] text-destructive">{n.error}</p>}
                      <div className="flex gap-1.5">
                        <button onClick={() => void run(n)} disabled={n.busy} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50">
                          {n.busy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run
                        </button>
                        <button onClick={() => n.url && onAsset(n.url, n.type as "image" | "video", `${n.type}_${n.id}`)} disabled={!n.url} className="flex items-center gap-1 rounded-md bg-secondary px-2 text-[11px] disabled:opacity-40"><FolderInput className="size-3" /> To bin</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {linking && <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground">Now tap the input dot of another node</p>}
      <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
        {(Object.keys(META) as NodeType[]).map((t) => { const I = META[t].icon; return (
          <button key={t} onClick={() => addNode(t)} title={`Add ${META[t].label}`} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] hover:bg-secondary"><Plus className="size-3 text-primary" /><I className="size-3.5" /><span className="hidden sm:inline">{META[t].label.split(" ·")[0]}</span></button>
        ); })}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <button onClick={() => setMode("select")} aria-label="Select" className={cn("grid size-7 shrink-0 place-items-center rounded-lg", mode === "select" ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}><MousePointer2 className="size-3.5" /></button>
        <button onClick={() => setMode("pan")} aria-label="Pan" className={cn("grid size-7 shrink-0 place-items-center rounded-lg", mode === "pan" ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}><Hand className="size-3.5" /></button>
        <button onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-secondary"><Minus className="size-3.5" /></button>
        <span className="w-10 shrink-0 text-center font-mono text-[10px]">{Math.round(view.z * 100)}%</span>
        <button onClick={() => zoomBy(1.2)} aria-label="Zoom in" className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-secondary"><Plus className="size-3.5" /></button>
        <button onClick={() => { fit(); force((x) => x + 1); }} aria-label="Fit to screen" className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-secondary"><Maximize className="size-3.5" /></button>
      </div>
    </div>
  );
}
