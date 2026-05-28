import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useEffect, useState } from "react"
import { authClient } from "~/lib/auth-client"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { PageHeader, PageShell } from "~/components/layout/page"
import {
  clockinStatusAtom,
  setupClockinMutation,
  SETUP_INVALIDATIONS,
} from "~/features/clockin/atoms/clockin-atoms"

function useMcpUrl() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => setUrl(`${window.location.origin}/mcp`), [])
  return url
}

function StatusBadge() {
  const status = useAtomValue(clockinStatusAtom)
  return Result.builder(status)
    .onInitial(() => (
      <span className="text-muted-foreground text-sm">Loading…</span>
    ))
    .onFailure(() => (
      <span className="text-destructive text-sm">Status unavailable</span>
    ))
    .onSuccess((s) =>
      s.configured ? (
        <span className="text-sm font-medium text-emerald-600">
          Configured · employee {s.employeeId}
          {s.updatedAt
            ? ` · updated ${new Date(s.updatedAt).toLocaleString()}`
            : ""}
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">Not configured</span>
      ),
    )
    .render()
}

function ConnectCard() {
  const status = useAtomValue(clockinStatusAtom)
  const configured = Result.match(status, {
    onInitial: () => false,
    onFailure: () => false,
    onSuccess: (s) => s.value.configured,
  })

  const runSetup = useAtomSet(setupClockinMutation, { mode: "promise" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    employeeId: number
    autoDetected: boolean
  } | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect to Clockin</CardTitle>
        <CardDescription>
          We log in to Clockin on your behalf and store the resulting tokens
          encrypted (AES-256-GCM). Your password is never persisted.
        </CardDescription>
        <div className="pt-2">
          <StatusBadge />
        </div>
      </CardHeader>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          setSuccess(null)
          const fd = new FormData(e.currentTarget)
          const overrideRaw = String(fd.get("employee_id") ?? "").trim()
          const override = overrideRaw ? Number(overrideRaw) : null
          setPending(true)
          try {
            const result = await runSetup({
              payload: {
                email: String(fd.get("email")),
                password: String(fd.get("password")),
                employeeIdOverride: override,
              },
              reactivityKeys: SETUP_INVALIDATIONS,
            })
            setSuccess(result)
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          } finally {
            setPending(false)
          }
        }}
      >
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Clockin email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Clockin password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee_id">Employee ID (optional)</Label>
            <Input
              id="employee_id"
              name="employee_id"
              type="number"
              min={1}
              placeholder="auto-detected via /device/config"
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : null}
          {success ? (
            <p className="text-sm text-emerald-600">
              Connected. Employee ID {success.employeeId}
              {success.autoDetected
                ? " (auto-detected)."
                : " (manual override)."}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end pt-6">
          <Button type="submit" disabled={pending}>
            {pending ? "Connecting…" : configured ? "Reconnect" : "Connect"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function McpEndpointCard() {
  const mcpUrl = useMcpUrl()
  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP endpoint</CardTitle>
        <CardDescription>
          Point your MCP client at this URL. OAuth 2.1 is negotiated on first
          connect; this server speaks the streamable HTTP transport.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <code className="bg-muted block rounded-md px-3 py-2 text-sm break-all">
          {mcpUrl ?? "…"}
        </code>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  const session = authClient.useSession()
  const email = session.data?.user.email ?? ""

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description={`Signed in as ${email}`}
        trailing={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              authClient.signOut().then(() => window.location.assign("/sign-in"))
            }
          >
            Sign out
          </Button>
        }
      />
      <ConnectCard />
      <McpEndpointCard />
    </PageShell>
  )
}
