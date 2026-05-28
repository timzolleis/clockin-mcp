import { useEffect, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router"
import { authClient } from "~/lib/auth-client"

export function AuthGuard({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!isPending && !session) {
      const next = encodeURIComponent(location.pathname + location.search)
      navigate(`/sign-in?next=${next}`, { replace: true })
    }
  }, [isPending, session, navigate, location])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border-muted border-t-foreground h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    )
  }
  if (!session) return null
  return <>{children}</>
}
