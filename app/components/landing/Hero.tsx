import { ArrowRight } from "lucide-react"
import { motion } from "motion/react"
import { Link } from "react-router"
import { Button } from "~/components/ui/button"
import { ChatMockup } from "./ChatMockup"
import { GitHub } from "./icons"
import { CLOCKIN_URL, REPO_URL } from "./meta"

const ease = [0.22, 1, 0.36, 1] as const

// Children stagger in under the hero on first paint.
const rise = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease, delay: 0.1 + i * 0.08 },
  }),
}

export function Hero() {
  return (
    <header className="pt-[78px] sm:pt-[110px]">
      <div className="mx-auto max-w-[1180px] px-7">
        <motion.a
          custom={0}
          variants={rise}
          initial="hidden"
          animate="show"
          href="#security"
          className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-bg2 px-3.5 py-[7px] text-sm text-ink2 transition-colors hover:border-white/[0.14] hover:bg-bg3"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-iris shadow-[0_0_9px_1px_rgba(124,132,255,0.35)]" />
          Now self-hostable on Cloudflare
          <span className="text-ink4">→</span>
        </motion.a>

        <motion.h1
          custom={1}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-6 max-w-[15ch] text-[clamp(46px,7.4vw,92px)] leading-[0.98] font-semibold tracking-[-0.035em] text-ink"
        >
          Track your time
          <br />
          by just asking.
        </motion.h1>

        <div className="mt-[30px] flex flex-wrap items-start justify-between gap-x-10 gap-y-7">
          <motion.p
            custom={2}
            variants={rise}
            initial="hidden"
            animate="show"
            className="max-w-[50ch] text-[17px] leading-relaxed text-ink3 sm:text-[19px]"
          >
            A self-hostable <b className="font-medium text-ink2">MCP server</b> that bridges{" "}
            <a
              href={CLOCKIN_URL}
              className="text-ink2 underline decoration-white/20 underline-offset-4 transition-colors hover:text-ink"
            >
              Clockin
            </a>{" "}
            to Claude and any MCP client. Clock in, switch projects, take breaks, and check your
            hours — entirely in conversation.
          </motion.p>

          <motion.div
            custom={3}
            variants={rise}
            initial="hidden"
            animate="show"
            className="flex flex-wrap items-center gap-3"
          >
            <Button size="lg" render={<Link to="/sign-up" />}>
              Get started
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" render={<a href={REPO_URL} />}>
              <GitHub className="size-4" />
              View on GitHub
            </Button>
          </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-7">
        <ChatMockup />
      </div>
    </header>
  )
}
