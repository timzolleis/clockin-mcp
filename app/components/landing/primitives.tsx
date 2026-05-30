import type { ReactNode } from "react"

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[18px] flex items-center gap-2.5 font-mono text-xs tracking-[0.06em] text-ink4 uppercase before:h-px before:w-[22px] before:bg-white/[0.14] before:content-['']">
      {children}
    </div>
  )
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={[
        "max-w-[18ch] text-[clamp(30px,4vw,46px)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink",
        className,
      ].join(" ")}
    >
      {children}
    </h2>
  )
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-[18px] max-w-[56ch] text-[18px] leading-relaxed text-ink3">{children}</p>
}
