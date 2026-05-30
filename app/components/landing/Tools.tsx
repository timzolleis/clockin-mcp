import { ArrowUpRight, Plus } from "lucide-react"
import { motion } from "motion/react"
import { REPO_URL } from "./meta"
import { Reveal } from "./Reveal"
import { Eyebrow, H2, Lead } from "./primitives"
import { TOOLS } from "./tool-data"

export function Tools() {
  return (
    <section id="tools" className="pb-24 md:pb-[120px]">
      <div className="mx-auto max-w-[1180px] px-7">
        <Reveal>
          <Eyebrow>Tools · {TOOLS.length}</Eyebrow>
          <H2>Your whole workday, exposed as tools.</H2>
          <Lead>
            Each capability is a typed MCP tool your assistant can call. No surface area you have to
            learn — it reads the schema and figures out the rest.
          </Lead>
        </Reveal>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          transition={{ staggerChildren: 0.04 }}
          className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-3"
        >
          {TOOLS.map(({ tag, Icon, blurb, args }) => (
            <motion.div
              key={tag}
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { duration: 0.5 } },
              }}
              className="group min-h-[164px] bg-bg1 px-[26px] pt-7 pb-[30px] transition-colors hover:bg-bg2"
            >
              <div className="mb-5 flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-white/10 bg-bg3 text-ink2 transition-colors group-hover:border-iris/30 group-hover:text-iris">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <code className="text-[14px] font-medium text-ink">{tag}</code>
              <span className="text-[14px] text-ink4">{args ? `(${args})` : "()"}</span>
              <p className="mt-2 text-sm leading-relaxed text-ink3">{blurb}</p>
            </motion.div>
          ))}

          <motion.div
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { duration: 0.5 } },
            }}
            className="flex min-h-[164px] flex-col bg-bg1 px-[26px] pt-7 pb-[30px] sm:col-span-2 lg:col-span-3"
          >
            <div className="mb-5 flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-dashed border-white/15 text-ink4">
              <Plus className="h-[18px] w-[18px]" />
            </div>
            <code className="text-[14px] font-medium text-ink2">more on the way</code>
            <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-ink4">
              New tools land as we grow the product — absence management and corrections are next.
            </p>
            <a
              href={`${REPO_URL}/issues/new`}
              target="_blank"
              rel="noreferrer"
              className="group mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-ink3 transition-colors hover:text-iris"
            >
              Request a feature
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-px group-hover:-translate-y-px" />
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
