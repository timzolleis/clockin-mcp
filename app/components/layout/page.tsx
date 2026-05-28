import type { ReactNode } from "react"
import { cn } from "~/lib/utils"

export function PageShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 px-6 py-12",
        className,
      )}
    >
      {children}
    </main>
  )
}

export function PageHeader({
  title,
  description,
  trailing,
}: {
  title: string
  description?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {trailing}
    </header>
  )
}
