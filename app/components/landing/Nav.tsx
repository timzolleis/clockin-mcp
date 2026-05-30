import { Clock } from "lucide-react"
import { motion } from "motion/react"
import { Link } from "react-router"
import { Button } from "~/components/ui/button"
import { GitHub } from "./icons"
import { REPO_URL } from "./meta"

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Tools", href: "#tools" },
  { label: "Security", href: "#security" },
]

export function Nav() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 border-b border-white/[0.07] bg-bg/70 backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-7">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <Clock className="h-[22px] w-[22px] text-iris" />
          <span className="font-mono text-[14.5px] font-medium tracking-tight text-ink">
            clockin-mcp
          </span>
        </a>

        <div className="mx-auto hidden items-center gap-[26px] md:flex">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm text-ink3 transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link to="/sign-in" />}>
            Sign in
          </Button>
          <Button size="sm" render={<a href={REPO_URL} />}>
            <GitHub className="size-4" />
            GitHub
          </Button>
        </div>
      </div>
    </motion.nav>
  )
}
