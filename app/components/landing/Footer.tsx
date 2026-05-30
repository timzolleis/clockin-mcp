import { Clock } from "lucide-react"
import { CLOCKIN_URL, MCP_DOCS_URL, REPO_URL } from "./meta"

const LINKS = [
  { label: "GitHub", href: REPO_URL },
  { label: "MCP docs", href: MCP_DOCS_URL },
  { label: "Clockin", href: CLOCKIN_URL },
]

export function Footer() {
  return (
    <footer id="docs" className="border-t border-white/[0.07] pt-14 pb-16">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-[30px] px-7">
        <a href="#top" className="flex items-center gap-2.5">
          <Clock className="h-[22px] w-[22px] text-iris" />
          <span className="font-mono text-[14.5px] font-medium tracking-tight text-ink">
            clockin-mcp
          </span>
        </a>

        <div className="flex flex-wrap gap-[26px]">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-sm text-ink3 transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="font-mono text-xs text-ink4">
          An independent open-source project · not affiliated with Clockin
        </div>
      </div>
    </footer>
  )
}
