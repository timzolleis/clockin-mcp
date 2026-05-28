import { useState } from "react"
import { useSearchParams } from "react-router"
import { authClient } from "~/lib/auth-client"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

export default function Consent() {
  const [params] = useSearchParams()
  const clientId = params.get("client_id")
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
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Authorize {clientId ?? "application"}</CardTitle>
          <CardDescription>
            This app is requesting the following scopes:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="bg-muted/40 space-y-1 rounded-md p-3 text-sm">
            {scopes.map((s) => (
              <li key={s} className="font-mono">
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="flex gap-2">
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
            Allow
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
