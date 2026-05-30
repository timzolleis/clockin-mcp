import { Reveal } from "./Reveal"
import { Eyebrow, H2 } from "./primitives"

const STEPS = [
  {
    n: "1",
    title: "Connect Clockin once",
    body: (
      <>
        Enter your login. Tokens are stored encrypted at rest with{" "}
        <code className="rounded bg-bg3 px-1.5 font-mono text-[12.5px] text-ink2">AES-256-GCM</code>
        . Your password is never persisted.
      </>
    ),
  },
  {
    n: "2",
    title: "Connect your MCP client",
    body: (
      <>
        OAuth 2.1 discovery, sign in, grant consent. The client receives a scoped{" "}
        <code className="rounded bg-bg3 px-1.5 font-mono text-[12.5px] text-ink2">JWT</code> bearer
        token.
      </>
    ),
  },
  {
    n: "3",
    title: "Just ask",
    body: <>Your assistant calls the tools as you — authenticated per request, no copy-pasting credentials.</>,
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="pb-24 md:pb-[120px]">
      <div className="mx-auto max-w-[1180px] px-7">
        <Reveal>
          <Eyebrow>How it works</Eyebrow>
          <H2>Three steps. Then forget it exists.</H2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-bg1 px-7 pt-[30px] pb-[34px]">
                <div className="mb-[22px] flex h-[30px] w-[30px] items-center justify-center rounded-md border border-iris/30 font-mono text-[13px] text-iris">
                  {s.n}
                </div>
                <h3 className="mb-2.5 text-[17px] font-semibold tracking-[-0.01em] text-ink">
                  {s.title}
                </h3>
                <p className="text-[14.5px] leading-relaxed text-ink3">{s.body}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4 rounded-[10px] border border-dashed border-white/10 px-5 py-4 font-mono text-[13.5px] text-ink3">
            <span className="text-ink">Claude</span>
            <span className="text-ink4">→</span>
            <span className="text-iris">clockin-mcp</span>
            <span className="text-ink4">→</span>
            <span className="text-ink">Clockin API</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
