import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Clapperboard, Loader2, Pause, Play, Send, Wand2, Film, Download } from "lucide-react";
import scene1 from "@/assets/scene1.jpg";
import scene2 from "@/assets/scene2.jpg";
import scene3 from "@/assets/scene3.jpg";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel — AI Video Agent Studio" },
      { name: "description", content: "Describe your video. The Reel agent scripts, storyboards and renders it for you." },
      { property: "og:title", content: "Reel — AI Video Agent Studio" },
      { property: "og:description", content: "Describe your video. The Reel agent scripts, storyboards and renders it for you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const STEPS = ["Understanding your brief", "Writing the script", "Planning shots", "Generating scenes", "Adding music & voiceover", "Final render"];

const SCENES = [
  { img: scene1, title: "Neon street", dur: 4, line: "The city never sleeps — it just changes colour." },
  { img: scene2, title: "Looking up", dur: 3, line: "Somewhere in the rain, she finds the light." },
  { img: scene3, title: "Dawn skyline", dur: 5, line: "And by morning, everything feels new." },
];

type Msg = { role: "user" | "agent"; text: string };

const IDEAS = ["30s cinematic city ad at night", "Product teaser for sneakers", "Travel reel, moody tones"];

function Studio() {
  const [prompt, setPrompt] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Hi, I'm Reel. Tell me what video you want and I'll script, shoot and cut it." },
  ]);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = step >= 0 && !done;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % SCENES.length), SCENES[active].dur * 700);
    return () => clearTimeout(t);
  }, [playing, active]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function run(text: string) {
    if (!text.trim() || running) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setPrompt("");
    setDone(false);
    setPlaying(false);
    setStep(0);
    let i = 0;
    timer.current = setInterval(() => {
      i++;
      if (i >= STEPS.length) {
        if (timer.current) clearInterval(timer.current);
        setDone(true);
        setStep(STEPS.length);
        setMsgs((m) => [...m, { role: "agent", text: `Done! Your 12s video "${text.slice(0, 40)}" is ready — 3 scenes, voiceover and a synth score. Tap a scene to tweak it.` }]);
        setPlaying(true);
      } else setStep(i);
    }, 1100);
  }

  const total = SCENES.reduce((a, s) => a + s.dur, 0);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Reel</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">Video agent</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">Demo mode</span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 p-4 md:grid-cols-[1fr_1.3fr] md:p-8">
        {/* Agent panel */}
        <section className="order-2 flex flex-col rounded-2xl border border-border bg-card md:order-1">
          <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: 420 }}>
            {msgs.map((m, i) => (
              <div key={i} className={cn("animate-rise text-sm leading-relaxed", m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground" : "max-w-[90%] text-foreground")}>
                {m.text}
              </div>
            ))}
            {step >= 0 && (
              <ol className="space-y-2 rounded-xl border border-border bg-muted/50 p-3">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn("flex items-center gap-2 text-xs", i > step ? "text-muted-foreground/50" : "text-foreground")}>
                    {i < step ? <Check className="size-3.5 text-accent" /> : i === step ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <span className="size-3.5 rounded-full border border-border" />}
                    {s}
                  </li>
                ))}
              </ol>
            )}
          </div>
          {msgs.length === 1 && (
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {IDEAS.map((i) => (
                <button key={i} onClick={() => run(i)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground">
                  {i}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); run(prompt); }} className="flex items-center gap-2 border-t border-border p-3">
            <Wand2 className="ml-1 size-4 shrink-0 text-muted-foreground" />
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your video…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <button disabled={running || !prompt.trim()} className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground transition disabled:opacity-40" aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </section>

        {/* Preview */}
        <section className="order-1 space-y-4 md:order-2">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-muted shadow-glow">
            {done ? (
              <img key={active} src={SCENES[active].img} alt={SCENES[active].title} width={1088} height={608} className="animate-rise size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-center">
                {running ? (
                  <div className="space-y-2">
                    <Loader2 className="mx-auto size-8 animate-spin text-primary" />
                    <p className="font-mono text-xs text-muted-foreground">{STEPS[step]}…</p>
                  </div>
                ) : (
                  <div className="space-y-2 px-6">
                    <Film className="mx-auto size-8 text-muted-foreground" />
                    <p className="font-display text-lg font-semibold">Your video appears here</p>
                    <p className="text-sm text-muted-foreground">Describe an idea to the agent to get started.</p>
                  </div>
                )}
                {running && <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-secondary"><div className="h-full w-1/3 animate-scan bg-primary" /></div>}
              </div>
            )}
            {done && (
              <p className="absolute inset-x-0 bottom-12 px-6 text-center font-display text-sm font-semibold text-foreground drop-shadow-lg md:text-lg">{SCENES[active].line}</p>
            )}
            {done && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-background/70 px-3 py-2 backdrop-blur">
                <button onClick={() => setPlaying((p) => !p)} className="text-foreground" aria-label="Play or pause">
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <div className="flex flex-1 gap-1">
                  {SCENES.map((s, i) => (
                    <div key={i} className={cn("h-1 rounded-full", i <= active ? "bg-primary" : "bg-secondary")} style={{ flex: s.dur }} />
                  ))}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">0:{String(total).padStart(2, "0")}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Storyboard</h2>
            {done && (
              <button className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
                <Download className="size-3.5" /> Export MP4
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SCENES.map((s, i) => (
              <button key={i} disabled={!done} onClick={() => { setActive(i); setPlaying(false); }} className={cn("overflow-hidden rounded-xl border text-left transition", done && i === active ? "border-primary" : "border-border", !done && "opacity-40")}>
                <div className="aspect-video bg-muted">
                  {(done || step > 3) && <img src={s.img} alt={s.title} loading="lazy" width={1088} height={608} className="size-full object-cover" />}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{s.title}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{s.dur}s</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
