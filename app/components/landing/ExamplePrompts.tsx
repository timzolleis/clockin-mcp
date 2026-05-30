import { MessageSquareText } from "lucide-react"
import { motion } from "motion/react"
import { Reveal } from "./Reveal"
import { Eyebrow, H2 } from "./primitives"

const PROMPTS = [
  "Clock me in.",
  "What am I working on right now?",
  "Switch me to the Acme redesign.",
  "How many hours do I still need this week?",
  "Take my lunch break.",
  "How did my week break down?",
]

export function ExamplePrompts() {
  return (
    <section id="prompts" className="py-24 md:py-[120px]">
      <div className="mx-auto max-w-[1180px] px-7">
        <Reveal>
          <Eyebrow>Talk to it like a person</Eyebrow>
          <H2>No commands. No dashboards. Just say what you need.</H2>
        </Reveal>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ staggerChildren: 0.06 }}
          className="mt-9 flex flex-wrap gap-3"
        >
          {PROMPTS.map((p) => (
            <motion.div
              key={p}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="group inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.01] py-2 pr-5 pl-2 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-iris/40 hover:shadow-[0_12px_30px_-16px_rgba(124,132,255,0.55)]"
            >
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-ink4 transition-colors group-hover:bg-iris/15 group-hover:text-iris">
                <MessageSquareText className="h-[13px] w-[13px]" />
              </span>
              <span className="font-mono text-sm text-ink2 transition-colors group-hover:text-ink">
                {p}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
