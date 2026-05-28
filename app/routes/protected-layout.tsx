import { Outlet } from "react-router"
import { ClientOnly } from "remix-utils/client-only"
import { AuthGuard } from "~/components/layout/auth-guard"

const Fallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="border-muted border-t-foreground h-8 w-8 animate-spin rounded-full border-4" />
  </div>
)

export default function ProtectedLayout() {
  return (
    <ClientOnly fallback={<Fallback />}>
      {() => (
        <AuthGuard>
          <Outlet />
        </AuthGuard>
      )}
    </ClientOnly>
  )
}
