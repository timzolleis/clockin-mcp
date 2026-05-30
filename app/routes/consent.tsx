import { Check } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router"
import { authClient } from "~/lib/auth-client"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardFooter } from "~/components/ui/card"

const SCOPE_LABELS: Record<string, string> = {
  openid: "Verify your identity",
  profile: "Read your basic profile",
  email: "Read your email address",
  offline_access: "Maintain access while you're away",
}

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

export default function Consent() {
  const [params] = useSearchParams()
  const clientId = params.get("client_id")
  const appName = clientId ?? "An application"
  const scopes = (params.get("scope") ?? "openid").split(/\s+/).filter(Boolean)
  const [busy, setBusy] = useState(false)

  const respond = async (accept: boolean) => {
    setBusy(true)
    const res = await authClient.oauth2.consent({ accept })
    // The consent endpoint returns { redirect: true, url } — we must
    // navigate to that URL so the authorization-code redirect fires.
    const data = (res as { data?: { redirect?: boolean; url?: string } }).data
    const url = data?.url
    if (url) {
      window.location.assign(url)
    } else {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-6 py-12">
      <Card className="w-full">
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-heading text-base font-medium">
              Authorize access
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">{appName}</span> wants to access
              your account.
            </p>
          </div>

          <ul className="space-y-2.5">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-center gap-2.5 text-sm">
                <Check className="size-4 shrink-0 text-muted-foreground" />
                <span>{scopeLabel(scope)}</span>
              </li>
            ))}
          </ul>
        </CardContent>

        <CardFooter className="mt-6 flex-col gap-3">
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => respond(false)}
              className="flex-1"
            >
              Deny
            </Button>
            <Button
              disabled={busy}
              onClick={() => respond(true)}
              className="flex-1"
            >
              {busy ? "Authorizing…" : "Allow"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can revoke access anytime in settings.
          </p>
        </CardFooter>
      </Card>
    </main>
  )
}
