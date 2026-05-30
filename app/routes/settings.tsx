import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { effectTsResolver } from "@hookform/resolvers/effect-ts"
import { Schema } from "effect"
import { Check, Copy, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { authClient } from "~/lib/auth-client"
import { EmailField, PasswordField } from "~/lib/forms/fields"
import { TextField } from "~/components/form/text-field"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { FieldError, FieldGroup } from "~/components/ui/field"
import { PageHeader, PageShell } from "~/components/layout/page"
import { cn } from "~/lib/utils"
import {
  clockinStatusAtom,
  setupClockinMutation,
  SETUP_INVALIDATIONS,
} from "~/features/clockin/atoms/clockin-atoms"
import {
  connectionsAtom,
  CONNECTIONS_INVALIDATIONS,
  revokeConnectionMutation,
} from "~/features/connections/atoms/connections-atoms"
import type { ConnectedClient } from "~/features/connections/router/connections-api-group"

const ConnectSchema = Schema.Struct({
  email: EmailField,
  password: PasswordField,
})
type ConnectValues = typeof ConnectSchema.Type

function useMcpUrl() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => setUrl(`${window.location.origin}/mcp`), [])
  return url
}

function StatusDot({ tone }: { tone: "ok" | "muted" | "error" }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "ok" && "bg-emerald-500",
        tone === "muted" && "bg-muted-foreground/40",
        tone === "error" && "bg-destructive"
      )}
    />
  )
}

function ConnectionStatusRow() {
  const status = useAtomValue(clockinStatusAtom)
  return Result.builder(status)
    .onInitial(() => (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusDot tone="muted" />
        Loading status…
      </div>
    ))
    .onFailure(() => (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <StatusDot tone="error" />
        Status unavailable
      </div>
    ))
    .onSuccess((s) =>
      s.configured ? (
        <div className="flex items-center gap-2 text-sm">
          <StatusDot tone="ok" />
          <span className="font-medium text-foreground">Connected</span>
          <span className="text-muted-foreground">
            · employee {s.employeeId}
            {s.updatedAt
              ? ` · updated ${new Date(s.updatedAt).toLocaleDateString()}`
              : ""}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusDot tone="muted" />
          Not connected
        </div>
      )
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
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    employeeId: number
    autoDetected: boolean
  } | null>(null)

  const form = useForm<ConnectValues>({
    resolver: effectTsResolver(ConnectSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setSuccess(null)
    try {
      const result = await runSetup({
        payload: values,
        reactivityKeys: SETUP_INVALIDATIONS,
      })
      setSuccess(result)
      form.reset(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clockin account</CardTitle>
        <CardDescription>
          We log in to Clockin on your behalf and store the resulting tokens
          encrypted (AES-256-GCM). Your password is never persisted.
        </CardDescription>
        <div className="pt-3">
          <ConnectionStatusRow />
        </div>
      </CardHeader>
      <FormProvider {...form}>
        <form onSubmit={onSubmit}>
          <CardContent>
            <FieldGroup>
              <TextField<ConnectValues>
                name="email"
                label="Clockin email"
                type="email"
                autoComplete="username"
              />
              <TextField<ConnectValues>
                name="password"
                label="Clockin password"
                type="password"
                autoComplete="current-password"
                description="Used once to authenticate; never stored."
              />
              {error ? <FieldError>{error}</FieldError> : null}
              {success ? (
                <p className="text-sm text-emerald-600">
                  Connected. Employee ID {success.employeeId}
                  {success.autoDetected
                    ? " (auto-detected)."
                    : " (manual override)."}
                </p>
              ) : null}
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Connecting…"
                : configured
                  ? "Reconnect"
                  : "Connect"}
            </Button>
          </CardFooter>
        </form>
      </FormProvider>
    </Card>
  )
}

function McpEndpointCard() {
  const mcpUrl = useMcpUrl()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!mcpUrl) return
    try {
      await navigator.clipboard.writeText(mcpUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (e.g. insecure context) — leave the URL selectable.
    }
  }

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
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-2xl bg-muted px-3 py-2 text-sm">
            {mcpUrl ?? "…"}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={copy}
            disabled={!mcpUrl}
            aria-label="Copy MCP endpoint URL"
          >
            {copied ? <Check className="text-emerald-600" /> : <Copy />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ClientRow({ client }: { client: ConnectedClient }) {
  const runRevoke = useAtomSet(revokeConnectionMutation, { mode: "promise" })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revoke = async () => {
    setBusy(true)
    setError(null)
    try {
      await runRevoke({
        payload: { clientId: client.clientId },
        reactivityKeys: CONNECTIONS_INVALIDATIONS,
      })
      // The list refetches via reactivity; this row will unmount.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
      setConfirming(false)
    }
  }

  const title = client.name?.trim() || client.clientId

  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {client.consentedAt
            ? `Authorized ${new Date(client.consentedAt).toLocaleDateString()}`
            : "Authorized"}
          {client.lastUsedAt
            ? ` · last used ${new Date(client.lastUsedAt).toLocaleDateString()}`
            : ""}
        </p>
        {client.scopes.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {client.scopes.map((scope) => (
              <span
                key={scope}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {scope}
              </span>
            ))}
          </div>
        ) : null}
        {error ? (
          <p className="pt-1 text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {confirming ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={revoke}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? "Revoking…" : "Confirm"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            Revoke
          </Button>
        )}
      </div>
    </div>
  )
}

function ConnectedClientsCard() {
  const connections = useAtomValue(connectionsAtom)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected clients</CardTitle>
        <CardDescription>
          Apps you&apos;ve authorized to reach the MCP endpoint on your behalf.
          Revoking deletes their tokens and access immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Result.builder(connections)
          .onInitial(() => (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ))
          .onFailure(() => (
            <p className="py-4 text-sm text-destructive">
              Couldn&apos;t load connected clients.
            </p>
          ))
          .onSuccess((clients) =>
            clients.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No clients connected yet. Connect an MCP client using the
                endpoint above and it&apos;ll appear here.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {clients.map((client) => (
                  <ClientRow key={client.clientId} client={client} />
                ))}
              </div>
            )
          )
          .render()}
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
        description={email ? `Signed in as ${email}` : undefined}
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
      <ConnectedClientsCard />
    </PageShell>
  )
}
