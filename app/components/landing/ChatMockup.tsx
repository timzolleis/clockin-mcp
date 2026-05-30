import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "~/lib/utils"
import { EXAMPLES, TOOLS, type DemoCard, type ToolTag } from "./tool-data"

// Keep the auto-playing thread bounded — it loops forever, so old turns are
// trimmed off the top once we're past this many messages.
const MAX_ITEMS = 6

// ---------------------------------------------------------------------------
// Rendered conversation items. Each carries a stable id so motion can track
// enter/exit and we can patch the typing/bar state in place.
// ---------------------------------------------------------------------------
type Item =
  | { id: number; role: "user"; text: string; caret: boolean }
  | { id: number; role: "assistant"; tag: ToolTag; reply: string; card: DemoCard | null; bar: number }

// Shared by the rail's sliding highlight and its dot so both travel on the
// exact same curve — otherwise the dot visibly trails the background.
const railSpring = { type: "spring", stiffness: 560, damping: 44 } as const

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function ChatMockup() {
  const [thread, setThread] = useState<Item[]>([])
  const [active, setActive] = useState<ToolTag | null>(null)
  const [started, setStarted] = useState(false)

  const zoneRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)
  const runRef = useRef(0) // bumps on every play() to cancel in-flight typing
  const autoRef = useRef(true) // autoplay stays on until the user picks a tool

  const patch = (id: number, p: Partial<Item>) =>
    setThread((prev) => prev.map((it) => (it.id === id ? ({ ...it, ...p } as Item) : it)))

  // Append one tool's example to the thread, typing the prompt then revealing
  // the assistant answer + card. Cancels itself if a newer play() starts.
  const play = useCallback(async (tag: ToolTag) => {
    const ex = EXAMPLES[tag]
    const myRun = ++runRef.current
    const reduce = prefersReduced()
    const wait = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, reduce ? Math.min(ms, 80) : ms))
    const cancelled = () => runRef.current !== myRun

    setActive(tag)

    const uid = ++idRef.current
    const typed = !reduce
    setThread((p) =>
      [...p, { id: uid, role: "user" as const, text: typed ? "" : ex.prompt, caret: typed }].slice(
        -MAX_ITEMS,
      ),
    )

    if (typed) {
      for (let i = 1; i <= ex.prompt.length; i++) {
        if (cancelled()) return
        await wait(26)
        patch(uid, { text: ex.prompt.slice(0, i) })
      }
      await wait(220)
      patch(uid, { caret: false })
    }
    if (cancelled()) return
    await wait(reduce ? 60 : 440)

    const aid = ++idRef.current
    setThread((p) =>
      [
        ...p,
        { id: aid, role: "assistant" as const, tag, reply: ex.reply, card: ex.card ?? null, bar: 0 },
      ].slice(-MAX_ITEMS),
    )
    if (ex.card?.kind === "overview") {
      await wait(reduce ? 0 : 200)
      if (cancelled()) return
      patch(aid, { bar: ex.card.pct })
    }
  }, [])

  // Start once the mockup scrolls into view.
  useEffect(() => {
    const el = zoneRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setStarted(true)
            io.disconnect()
          }
        }),
      { threshold: 0.2 },
    )
    io.observe(el)
    const fallback = setTimeout(() => setStarted(true), 1400)
    return () => {
      io.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  // Autoplay a never-ending demo: pick a random tool, play it, repeat. Stops
  // the moment the user takes over by picking a tool themselves.
  useEffect(() => {
    if (!started) return
    let cancelled = false
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const tags = TOOLS.map((t) => t.tag)
    ;(async () => {
      await wait(500)
      let last: ToolTag | null = null
      while (!cancelled && autoRef.current) {
        let tag = tags[Math.floor(Math.random() * tags.length)]
        while (tags.length > 1 && tag === last) {
          tag = tags[Math.floor(Math.random() * tags.length)]
        }
        last = tag
        await play(tag)
        if (cancelled || !autoRef.current) return
        await wait(2600)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [started, play])

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReduced() ? "auto" : "smooth" })
  }, [thread])

  const pick = (tag: ToolTag) => {
    autoRef.current = false
    play(tag)
  }

  return (
    <div ref={zoneRef} className="relative mt-[64px]">
      {/* glow */}
      <div
        className="pointer-events-none absolute top-[-40px] left-1/2 z-0 h-[420px] w-[880px] max-w-[120%] -translate-x-1/2 blur-[8px]"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 0%, rgba(124,132,255,0.16), transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="relative z-10 overflow-hidden rounded-xl border border-white/10 bg-bg1 shadow-[0_-1px_0_0_rgba(255,255,255,0.05),0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      >
        {/* title bar */}
        <div className="flex h-[38px] items-center gap-[7px] border-b border-white/[0.07] bg-gradient-to-b from-white/[0.025] to-transparent px-3.5">
          <span className="h-[11px] w-[11px] rounded-full bg-[#2a2c30]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#2a2c30]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#2a2c30]" />
          <span className="ml-2.5 font-mono text-xs text-ink4">claude — clockin-mcp</span>
          <span className="ml-auto hidden font-mono text-[10.5px] text-ink4 sm:inline">
            pick a tool →
          </span>
        </div>

        <div className="grid min-h-[470px] grid-cols-1 md:grid-cols-[236px_1fr]">
          {/* tool rail */}
          <aside className="hidden max-h-[508px] overflow-y-auto border-r border-white/[0.07] bg-bg p-3 md:block">
            <div className="px-2.5 pt-1 pb-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink4 uppercase">
              Available tools · {TOOLS.length}
            </div>
            {TOOLS.map(({ tag, Icon }) => {
              const on = active === tag
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => pick(tag)}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left font-mono text-[12.5px] transition-colors",
                    on ? "text-ink" : "text-ink3 hover:bg-bg3 hover:text-ink2",
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="tool-active"
                      transition={railSpring}
                      className="absolute inset-0 rounded-md bg-iris/15"
                    />
                  )}
                  <Icon
                    className={cn("relative size-[15px] shrink-0", on ? "text-iris" : "text-ink4")}
                  />
                  <span className="relative truncate">{tag}</span>
                  {on && (
                    <motion.span
                      layoutId="tool-dot"
                      transition={railSpring}
                      className="relative ml-auto h-1.5 w-1.5 rounded-full bg-iris"
                    />
                  )}
                </button>
              )
            })}
          </aside>

          {/* conversation */}
          <div
            ref={scrollRef}
            className="flex max-h-[508px] flex-col gap-[22px] overflow-y-auto px-5 py-6 sm:px-[30px] [scrollbar-width:thin]"
          >
            <AnimatePresence initial={false}>
              {thread.map((it) =>
                it.role === "user" ? (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="flex max-w-full flex-row-reverse items-center gap-3 self-end sm:max-w-[92%]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-bg3 to-bg2 font-mono text-[10.5px] font-semibold text-ink2 ring-1 ring-white/[0.08]">
                      JS
                    </div>
                    <div className="rounded-[11px] border border-white/10 bg-bg3 px-3.5 py-2.5 font-mono text-[13.5px] leading-snug text-ink">
                      {it.text}
                      {it.caret && <span className="caret" />}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="flex max-w-full items-start gap-3 sm:max-w-[92%]"
                  >
                    <div className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-iris text-[12px] font-semibold text-white shadow-[0_3px_12px_-3px_rgba(124,132,255,0.7)]">
                      ✦
                    </div>
                    <div className="min-w-0">
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-bg2 px-2 py-1 font-mono text-[10.5px] text-ink4">
                        <span className="text-good">✓</span>
                        called <span className="text-ink2">{it.tag}</span>
                      </div>
                      <div
                        className="text-[14.5px] leading-normal text-ink2"
                        dangerouslySetInnerHTML={{ __html: it.reply }}
                      />
                      {it.card && <CardView card={it.card} bar={it.bar} />}
                    </div>
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rich result cards
// ---------------------------------------------------------------------------

function CardView({ card, bar }: { card: DemoCard; bar: number }) {
  switch (card.kind) {
    case "status":
      return <StatusCard card={card} />
    case "confirm":
      return <ConfirmCard card={card} />
    case "overview":
      return <OverviewCard card={card} bar={bar} />
    case "projects":
      return <ProjectsCard card={card} />
    case "workdays":
      return <WorkdaysCard card={card} />
  }
}

const cardShell =
  "mt-[11px] max-w-[400px] overflow-hidden rounded-[10px] border border-white/10 bg-bg2"

function StatusCard({ card }: { card: Extract<DemoCard, { kind: "status" }> }) {
  return (
    <div className={cardShell}>
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-[15px] py-[11px]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
        </span>
        <span className="text-[13px] font-semibold text-ink">{card.label}</span>
      </div>
      <div className="grid grid-cols-2 px-[15px] py-3.5">
        <Row k="Since" v={card.since} />
        {card.project && <Row k="Project" v={card.project} />}
      </div>
    </div>
  )
}

function ConfirmCard({ card }: { card: Extract<DemoCard, { kind: "confirm" }> }) {
  const tone = card.tone === "good" ? "bg-good/15 text-good" : "bg-iris/15 text-iris"
  return (
    <div className="mt-2.5 flex max-w-[400px] items-start gap-2.5 rounded-[10px] border border-white/10 bg-bg2 px-[13px] py-[11px] text-[13px] text-ink2">
      <span className={cn("mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]", tone)}>
        {card.tone === "good" ? "✓" : "❚❚"}
      </span>
      <div>
        <div className="font-medium text-ink">{card.title}</div>
        {card.detail && (
          <div
            className="mt-0.5 leading-snug text-ink3"
            dangerouslySetInnerHTML={{ __html: card.detail }}
          />
        )}
      </div>
    </div>
  )
}

function OverviewCard({ card, bar }: { card: Extract<DemoCard, { kind: "overview" }>; bar: number }) {
  return (
    <div className={cardShell}>
      <div className="flex items-center justify-between border-b border-white/[0.07] px-[15px] py-[11px]">
        <span className="text-[13px] font-semibold text-ink">This week — target {card.target}</span>
        <span className="font-mono text-[11px] text-ink4">CW 23</span>
      </div>
      <div className="px-[15px] pt-3.5 pb-1.5">
        <div className="mb-2 flex justify-between text-xs text-ink3">
          <span>
            <span className="font-medium text-ink">{card.worked}</span> worked
          </span>
          <span>{card.toGo} to go</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg3">
          <div className="bar-fill" style={{ width: `${bar}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 px-[15px] pt-1.5 pb-3.5">
        {card.rows.map((r) => (
          <Row key={r.k} k={r.k} v={r.v} pos={r.pos} />
        ))}
      </div>
    </div>
  )
}

function ProjectsCard({ card }: { card: Extract<DemoCard, { kind: "projects" }> }) {
  return (
    <div className={cardShell}>
      <div className="flex items-center justify-between border-b border-white/[0.07] px-[15px] py-[11px]">
        <span className="text-[13px] font-semibold text-ink">Projects</span>
        <span className="font-mono text-[11px] text-ink4">{card.rows.length} found</span>
      </div>
      <div className="flex flex-col">
        {card.rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.3 }}
            className="flex items-center justify-between border-t border-white/[0.05] px-[15px] py-[9px] first:border-t-0"
          >
            <span className="flex items-center gap-2 text-[13px] text-ink2">
              {r.active && <span className="h-1.5 w-1.5 rounded-full bg-good" />}
              <span className={r.active ? "text-ink" : ""}>{r.name}</span>
            </span>
            <code className="font-mono text-[11px] text-ink4">#{r.id}</code>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function WorkdaysCard({ card }: { card: Extract<DemoCard, { kind: "workdays" }> }) {
  return (
    <div className={cardShell}>
      <div className="flex items-center justify-between border-b border-white/[0.07] px-[15px] py-[11px]">
        <span className="text-[13px] font-semibold text-ink">Recent workdays</span>
        <span className="font-mono text-[11px] text-ink4">CW 23</span>
      </div>
      <div className="flex flex-col gap-3 px-[15px] py-3.5">
        {card.rows.map((r, i) => (
          <div key={r.day} className="flex items-center gap-3">
            <div className="w-[58px] shrink-0">
              <div className="text-[12.5px] font-medium text-ink">{r.day}</div>
              <div className="text-[10.5px] text-ink4">{r.date}</div>
            </div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-iris to-[#9aa0ff]"
                initial={{ width: 0 }}
                animate={{ width: `${r.pct}%` }}
                transition={{ delay: 0.15 + 0.1 * i, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="w-[60px] shrink-0 text-right font-mono text-[11.5px] text-ink2">
              {r.total}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ k, v, pos }: { k: string; v: string; pos?: boolean }) {
  return (
    <div className="py-[9px]">
      <div className="mb-[3px] text-[11.5px] text-ink4">{k}</div>
      <div className={cn("font-mono text-sm", pos ? "text-good" : "text-ink")}>{v}</div>
    </div>
  )
}
