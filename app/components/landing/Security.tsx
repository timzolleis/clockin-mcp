import { Cloud, Lock, RotateCcw, ShieldCheck, Users } from "lucide-react"
import type { ComponentType, ReactNode, SVGProps } from "react"
import { Button } from "~/components/ui/button"
import { GitHub } from "./icons"
import { REPO_URL } from "./meta"
import { Reveal } from "./Reveal"
import { Eyebrow, H2 } from "./primitives"

const ROWS: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  body: ReactNode
}[] = [
  {
    Icon: ShieldCheck,
    title: "Encrypted at rest",
    body: (
      <>
        Clockin tokens sealed with{" "}
        <code className="font-mono text-xs text-ink2">AES-256-GCM</code>. Your password is never
        written to disk.
      </>
    ),
  },
  {
    Icon: Lock,
    title: "OAuth 2.1, end to end",
    body: <>Standards-based discovery, consent, and scoped JWT bearer tokens. No long-lived secrets in the client.</>,
  },
  {
    Icon: Users,
    title: "Multi-user by design",
    body: <>One server, many people — each request authenticated independently as the right person.</>,
  },
  {
    Icon: RotateCcw,
    title: "Review & revoke anytime",
    body: <>See every connected client and cut access with one click. Nothing lingers without your consent.</>,
  },
  {
    Icon: Cloud,
    title: "Self-host on Cloudflare",
    body: <>Deploys to Cloudflare Workers + D1. Runs at the edge, on your account, under your domain.</>,
  },
]

const STACK = [
  { nm: "Cloudflare Workers", tg: "edge runtime" },
  { nm: "Cloudflare D1", tg: "database" },
  { nm: "React Router 7", tg: "app + consent UI" },
  { nm: "better-auth", tg: "OAuth 2.1" },
  { nm: "Effect", tg: "runtime & errors" },
  { nm: "TypeScript", tg: "end to end" },
]

export function Security() {
  return (
    <section id="security" className="pb-24 md:pb-[120px]">
      <div className="mx-auto max-w-[1180px] px-7">
        <Reveal>
          <div className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg2 px-[13px] py-1.5 text-[13px] text-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
            Open source · MIT licensed
          </div>
          <Eyebrow>Security &amp; self-hosting</Eyebrow>
          <H2>Your credentials. Your infrastructure. Your call.</H2>
        </Reveal>

        <div className="mt-[52px] grid grid-cols-1 items-start gap-16 md:grid-cols-2">
          <Reveal className="flex flex-col">
            <div className="flex flex-col">
              {ROWS.map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="flex gap-[15px] border-t border-white/[0.07] py-[18px] first:border-t-0"
                >
                  <span className="mt-0.5 shrink-0 text-iris">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <h4 className="mb-1 text-[15px] font-semibold text-ink">{title}</h4>
                    <p className="text-sm leading-snug text-ink3">{body}</p>
                  </div>
                </div>
              ))}
              <div className="mt-8 flex flex-wrap gap-3">
                <Button render={<a href={REPO_URL} />}>
                  <GitHub className="size-4" />
                  View on GitHub
                </Button>
                <Button variant="outline" render={<a href={`${REPO_URL}#self-hosting`} />}>
                  Read the deploy guide →
                </Button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-xl border border-white/10 bg-bg1 px-[26px] pt-[26px] pb-7 md:sticky md:top-[88px]">
              <div className="mb-[18px] font-mono text-[11px] tracking-[0.06em] text-ink4 uppercase">
                The stack
              </div>
              <div className="flex flex-col">
                {STACK.map((s) => (
                  <div
                    key={s.nm}
                    className="flex items-center justify-between border-t border-white/[0.07] py-[13px] text-sm first:border-t-0"
                  >
                    <span className="font-mono text-ink2">{s.nm}</span>
                    <span className="text-xs text-ink4">{s.tg}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
