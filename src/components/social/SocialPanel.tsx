"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useGaze } from "@/lib/gazeContext";
import { playLocalLaugh } from "@/lib/social/laughSound";

type Mode = "links" | "videos";
type Clip = { id: string; name: string; src: string; liked: boolean };
interface Props { onClose?: () => void; initialTab?: "feed" | "messages"; initialThread?: string; showAgentBar?: boolean }
const SITES = [
  { name: "X", url: "https://x.com/", color: "#111" },
  { name: "Facebook", url: "https://www.facebook.com/", color: "#1877F2" },
  { name: "TikTok", url: "https://www.tiktok.com/", color: "#111" },
] as const;
function Logo({ name }: { name: (typeof SITES)[number]["name"] }) {
  if (name === "Facebook") return <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true"><path d="M13.5 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.5 1.6-1.5h1.7V3.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.3v3.2h2.8V21h3.4Z" /></svg>;
  if (name === "TikTok") return <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true"><path d="M19.6 7.1a6.2 6.2 0 0 1-3.8-1.3v8.1a5.8 5.8 0 1 1-5-5.7v3.2a2.7 2.7 0 1 0 1.8 2.5V2h3.2c.1 2.3 1.7 4.2 3.8 4.6v.5Z" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.9 5.8 22H2.6l7.3-8.4L1.2 2h6.5l4.5 6.7L18.9 2Zm-1.1 17.8h1.7L6.7 4.1H4.9l12.9 15.7Z" /></svg>;
}
export function SocialPanel({ onClose }: Props) {
  const gaze = useGaze();
  const [mode, setMode] = useState<Mode>("links");
  const [handsFree, setHandsFree] = useState(false);
  const [dwell, setDwell] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState("");
  const urls = useRef(new Set<string>());
  const watch = useRef<{ el: HTMLElement | null; at: number; x: number; y: number; fired: boolean }>({ el: null, at: 0, x: 0, y: 0, fired: false });
  const edge = useRef({ side: "", at: 0, fired: false });
  const lastBlink = useRef(gaze.blinkCount);
  const blinkTimes = useRef<number[]>([]);
  const current = clips[index];
  const step = useCallback((direction: -1 | 1) => setIndex((i) => Math.max(0, Math.min(clips.length - 1, i + direction))), [clips.length]);

  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);
  useEffect(() => {
    if (!handsFree || lastBlink.current === gaze.blinkCount) return;
    lastBlink.current = gaze.blinkCount;
    const now = Date.now();
    blinkTimes.current = [...blinkTimes.current.filter((t) => now - t < 1000), now];
    if (blinkTimes.current.length >= 2) { blinkTimes.current = []; playLocalLaugh(); setStatus("Laugh sound played after a double blink."); }
  }, [gaze.blinkCount, handsFree]);

  useEffect(() => {
    if (!handsFree) { watch.current.el = null; edge.current = { side: "", at: 0, fired: false }; return; }
    const tick = () => {
      if (!gaze.isTracking || !gaze.isFaceDetected) { watch.current.el = null; setDwell(0); edge.current = { side: "", at: 0, fired: false }; return; }
      const { x, y } = gaze.gazePositionRef.current;
      const hit = document.elementFromPoint(x, y);
      const el = hit instanceof HTMLElement ? hit.closest<HTMLElement>("[data-gaze-target]") : null;
      if (el) {
        edge.current = { side: "", at: 0, fired: false };
        const w = watch.current, now = performance.now();
        if (w.el !== el) watch.current = { el, at: now, x, y, fired: false };
        else if (Math.hypot(x - w.x, y - w.y) > 34) { w.at = now; w.x = x; w.y = y; w.fired = false; }
        const active = watch.current, ms = Math.max(450, Number(el.dataset.gazeDwellMs) || 900);
        const elapsed = now - active.at;
        setDwell(Math.min(100, elapsed / ms * 100));
        if (elapsed >= ms && !active.fired) { active.fired = true; el.click(); }
        return;
      }
      watch.current.el = null; setDwell(0);
      if (mode !== "videos" || clips.length < 2 || !window.innerWidth) { edge.current = { side: "", at: 0, fired: false }; return; }
      const pct = x / window.innerWidth, side = pct < .045 ? "prev" : pct > .955 ? "next" : "";
      if (!side) { edge.current = { side: "", at: 0, fired: false }; return; }
      const now = performance.now();
      if (edge.current.side !== side) edge.current = { side, at: now, fired: false };
      if (now - edge.current.at > 750 && !edge.current.fired) { edge.current.fired = true; step(side === "prev" ? -1 : 1); setStatus(side === "prev" ? "Previous video." : "Next video."); }
    };
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [clips.length, gaze.gazePositionRef, gaze.isFaceDetected, gaze.isTracking, handsFree, mode, step]);

  const toggleHandsFree = () => {
    const next = !handsFree; setHandsFree(next); setDwell(0);
    if (next && !gaze.isTracking) gaze.initialize();
  };
  const addVideos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []).filter((file) => file.type.startsWith("video/"));
    const next = files.map((file) => { const src = URL.createObjectURL(file); urls.current.add(src); return { id: `${file.name}-${file.lastModified}-${Math.random()}`, name: file.name, src, liked: false }; });
    if (next.length) { setClips((old) => [...old, ...next]); setIndex(clips.length); setMode("videos"); setStatus(`${next.length} local video${next.length === 1 ? "" : "s"} added.`); }
    event.currentTarget.value = "";
  };
  const toggleLike = () => {
    setClips((old) => old.map((clip, i) => i === index ? { ...clip, liked: !clip.liked } : clip));
    setStatus(current?.liked ? "Like removed." : "Video liked.");
  };
  const target = (id: string, extra = "") => ({ "data-gaze-target": id, className: extra });

  return <section aria-label="i-see social launchpad" className="fixed inset-0 z-[800] flex flex-col overflow-y-auto bg-[var(--iris-bg)] p-3 text-[var(--iris-text)] sm:p-6">
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-b-4 border-[var(--ink)] pb-4">
      <div><p className="text-xs font-black uppercase tracking-[.2em] text-[var(--iris-text-secondary)]">IRIS · SOCIAL ACCESS</p><h1 className="text-2xl font-black sm:text-3xl">Stay connected, your way.</h1></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" {...target("hands-free", "rounded-lg border-2 border-[var(--ink)] bg-white px-4 py-2 text-sm font-bold shadow-[3px_3px_0_#2A0E3A]")} aria-pressed={handsFree} onClick={toggleHandsFree}>{handsFree ? "Hands-free on · turn off" : "Enable hands-free gaze"}</button>
        {onClose && <button type="button" {...target("close", "rounded-lg border-2 border-[var(--ink)] px-4 py-2 font-bold")} onClick={onClose}>Close ×</button>}
      </div>
    </header>
    <div className="mx-auto w-full max-w-5xl py-4">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Social modes" className="flex gap-2">
          <button type="button" {...target("mode-links", `rounded-lg border-2 border-[var(--ink)] px-4 py-2 font-bold ${mode === "links" ? "bg-[var(--btn-purple)] text-white" : "bg-white"}`)} aria-pressed={mode === "links"} onClick={() => setMode("links")}>Social sites</button>
          <button type="button" {...target("mode-videos", `rounded-lg border-2 border-[var(--ink)] px-4 py-2 font-bold ${mode === "videos" ? "bg-[var(--btn-purple)] text-white" : "bg-white"}`)} aria-pressed={mode === "videos"} onClick={() => setMode("videos")}>My video feed</button>
        </nav>
        <p className="text-sm font-semibold" aria-live="polite">{gaze.isTracking && gaze.isFaceDetected ? "Gaze tracking ready" : handsFree ? "Looking for your gaze…" : "Gaze controls are off"}</p>
      </div>
      {mode === "links" ? <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border-4 border-[var(--ink)] bg-white p-5 shadow-[4px_4px_0_#2A0E3A]">
          <h2 className="mb-1 text-xl font-black">Open a social network</h2><p className="mb-5 text-sm text-[var(--iris-text-secondary)]">These buttons open the real services in a new tab. Sign in there to view your own feed and messages.</p>
          <div className="grid gap-3 sm:grid-cols-3">{SITES.map((site) => <a key={site.name} {...target(`site-${site.name}`)} href={site.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${site.name} in a new tab`} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--ink)] p-4 font-black shadow-[3px_3px_0_#2A0E3A] hover:-translate-y-0.5" style={{ color: site.color }}><Logo name={site.name} /><span>{site.name}</span></a>)}</div>
        </section>
        <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border-4 border-[var(--ink)] bg-[#FFF1B8] p-5 text-center shadow-[4px_4px_0_#2A0E3A]">
          <h2 className="text-xl font-black">Share a laugh</h2><p className="text-sm">Tap or dwell to play a short, locally generated laugh sound.</p>
          <button type="button" {...target("laugh", "flex min-h-24 min-w-40 items-center justify-center gap-3 rounded-xl border-2 border-[var(--ink)] bg-white px-5 py-4 text-lg font-black shadow-[3px_3px_0_#2A0E3A]")} onClick={() => { playLocalLaugh(); setStatus("Laugh sound played."); }}><span aria-hidden="true" className="text-4xl">😂</span>Laugh</button>
          <p className="text-xs">Hands-free: enable gaze and double-blink, or dwell on Laugh.</p>
        </section>
      </div> : <section className="rounded-2xl border-4 border-[var(--ink)] bg-white p-5 shadow-[4px_4px_0_#2A0E3A]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Your local video feed</h2><p className="text-sm text-[var(--iris-text-secondary)]">Only videos you choose are shown. Nothing is pre-filled or uploaded.</p></div>
          <label className="cursor-pointer rounded-lg border-2 border-[var(--ink)] bg-[#E6F6F1] px-4 py-2 font-bold shadow-[3px_3px_0_#2A0E3A]">Add videos from this device<input className="sr-only" type="file" accept="video/*" multiple onChange={addVideos} /></label>
        </div>
        {current ? <div className="mx-auto max-w-2xl">
          <div className="relative overflow-hidden rounded-xl border-2 border-[var(--ink)] bg-black"><video key={current.id} src={current.src} controls playsInline className="max-h-[55vh] w-full" aria-label={current.name} />
            <button type="button" {...target("like-video", "absolute right-3 top-3 rounded-full border-2 border-white bg-black/70 px-4 py-2 text-lg font-black text-white")} data-gaze-dwell-ms="1600" aria-pressed={current.liked} onClick={toggleLike}>{current.liked ? "♥ Liked" : "♡ Like"}</button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2"><button type="button" {...target("previous-video", "rounded-lg border-2 border-[var(--ink)] px-4 py-2 font-bold")} disabled={index === 0} onClick={() => step(-1)}>← Previous</button><p className="min-w-0 flex-1 truncate text-center text-sm font-bold">{index + 1} / {clips.length} · {current.name}</p><button type="button" {...target("next-video", "rounded-lg border-2 border-[var(--ink)] px-4 py-2 font-bold")} disabled={index >= clips.length - 1} onClick={() => step(1)}>Next →</button></div>
          <p className="mt-3 text-center text-xs text-[var(--iris-text-secondary)]">Hold gaze at a screen edge for 0.75s to move between videos. Dwell on Like for 1.6s.</p>
        </div> : <div className="rounded-xl border-2 border-dashed border-[var(--ink)] p-10 text-center"><p className="text-lg font-bold">Your feed is empty</p><p className="mt-1 text-sm text-[var(--iris-text-secondary)]">Add one or more video files from this device to begin. No example posts or videos are shown.</p></div>}
      </section>}
    </div>
    <footer className="mx-auto mt-auto w-full max-w-5xl border-t-2 border-[var(--ink)]/20 pt-3 text-sm" aria-live="polite">
      {handsFree && <p className="mb-2">{gaze.isTracking ? "Hands-free on: stable gaze dwell selects controls." : "Allow camera access to use gaze controls."} Double-blink plays the laugh sound. {mode === "videos" && clips.length > 1 ? "Hold left/right screen edge to navigate." : ""}</p>}
      {dwell > 0 && <div className="mb-2 h-2 max-w-xs overflow-hidden rounded-full bg-black/10" aria-label={`Dwell progress ${Math.round(dwell)}%`}><div className="h-full bg-[var(--iris-accent)] transition-[width]" style={{ width: `${dwell}%` }} /></div>}{status}
    </footer>
  </section>;
}
