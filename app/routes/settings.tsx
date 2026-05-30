import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { effectTsResolver } from "@hookform/resolvers/effect-ts"
import { Schema } from "effect"
import {
  Boxes,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  SquareTerminal,
  User,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { PageHeader, PageShell } from "~/components/layout/page"
import type { Route } from "./+types/settings"
import { cn } from "~/lib/utils"

export function meta(_: Route.MetaArgs) {
  return [{ title: "Settings — clockin-mcp" }]
}
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
        tone === "ok" && "status-pulse bg-[var(--color-good)]",
        tone === "muted" && "bg-muted-foreground/40",
        tone === "error" && "bg-destructive"
      )}
    />
  )
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "muted" | "error"
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "ok" && "border-border bg-muted text-foreground",
        tone === "muted" && "border-border bg-muted text-muted-foreground",
        tone === "error" && "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  )
}

function MetaBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
      <Icon className="size-3.5 text-muted-foreground" aria-label={label} />
      <span className="font-mono text-foreground/90">{value}</span>
    </span>
  )
}

function ConnectionStatusRow() {
  const status = useAtomValue(clockinStatusAtom)
  return Result.builder(status)
    .onInitial(() => <StatusBadge tone="muted">Loading…</StatusBadge>)
    .onFailure(() => (
      <StatusBadge tone="error">Status unavailable</StatusBadge>
    ))
    .onSuccess((s) =>
      s.configured ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="ok">Connected</StatusBadge>
          <MetaBadge icon={User} label="employee" value={s.employeeId} />
          {s.updatedAt ? (
            <MetaBadge
              icon={Clock}
              label="updated"
              value={new Date(s.updatedAt).toLocaleDateString()}
            />
          ) : null}
        </div>
      ) : (
        <StatusBadge tone="muted">Not connected</StatusBadge>
      )
    )
    .render()
}

/**
 * Password input wired to the surrounding form, with a show/hide toggle.
 * Lives here rather than in the shared TextField since it's the only
 * field that needs the trailing reveal control.
 */
function PasswordInputField({
  name,
  label,
  description,
  autoComplete,
}: {
  name: "password"
  label: string
  description?: string
  autoComplete?: string
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ConnectValues>()
  const [show, setShow] = useState(false)
  const error = errors[name] as { message?: string } | undefined

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className="pr-11"
          {...register(name)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-1.5 my-auto flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={error ? [error] : undefined} />
    </Field>
  )
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
          encrypted (<span className="font-mono text-foreground/80">AES-256-GCM</span>).
          Your password is never persisted.
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
              <PasswordInputField
                name="password"
                label="Clockin password"
                autoComplete="current-password"
                description="Used once to authenticate; never stored."
              />
              {error ? <FieldError>{error}</FieldError> : null}
              {success ? (
                <p className="text-sm text-[var(--color-good)]">
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
              {form.formState.isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : null}
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

type Snippet = { label: string; code: string; hint?: string }

/** shadcn-style tabbed command block: tool tabs + copy, code body below. */
function CodeTabs({ snippets }: { snippets: Snippet[] }) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const current = snippets[active]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — the command stays selectable.
    }
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-muted">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {snippets.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setActive(i)
                setCopied(false)
              }}
              className={cn(
                "shrink-0 rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors",
                i === active
                  ? "border border-border bg-background text-foreground"
                  : "border border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy command"
          className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-[var(--color-good)]" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <div className="overflow-x-auto px-4 py-3.5">
        {current.hint ? (
          <p className="mb-2 font-mono text-xs text-muted-foreground/70">
            {current.hint}
          </p>
        ) : null}
        <pre className="font-mono text-sm leading-relaxed text-foreground/90">
          <code>{current.code}</code>
        </pre>
      </div>
    </div>
  )
}

function ClientSetupCard() {
  const mcpUrl = useMcpUrl()
  const url = mcpUrl ?? "https://your-app.example/mcp"

  const snippets: Snippet[] = [
    {
      label: "Claude Code",
      code: `claude mcp add --transport http clockin ${url}`,
    },
    {
      label: "Codex",
      code: `codex mcp add clockin --url ${url}`,
    },
    {
      label: "VS Code",
      hint: ".vscode/mcp.json",
      code: `{
  "mcpServers": {
    "clockin": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}"]
    }
  }
}`,
    },
    {
      label: "Zed",
      hint: "settings.json",
      code: `{
  "context_servers": {
    "clockin": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}"],
      "env": {}
    }
  }
}`,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add to your client</CardTitle>
        <CardDescription>
          Register this MCP server with your tool of choice. You&apos;ll be
          prompted to authorize on first connect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CodeTabs snippets={snippets} />
      </CardContent>
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
          <Input
            readOnly
            value={mcpUrl ?? "…"}
            aria-label="MCP endpoint URL"
            className="flex-1 font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copy}
            disabled={!mcpUrl}
            aria-label="Copy MCP endpoint URL"
          >
            {copied ? <Check className="text-[var(--color-good)]" /> : <Copy />}
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
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted text-muted-foreground">
          <Boxes className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="font-mono text-xs text-muted-foreground">
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
              <div className="rounded-[10px] border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
                No clients connected yet. Connect an MCP client using the
                endpoint above and it&apos;ll appear here.
              </div>
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
        description={
          email ? (
            <>
              Signed in as{" "}
              <span className="font-mono text-foreground/80">{email}</span>
            </>
          ) : undefined
        }
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              authClient.signOut().then(() => window.location.assign("/sign-in"))
            }
          >
            <LogOut />
            Sign out
          </Button>
        }
      />
      <ConnectCard />
      <McpEndpointCard />
      <ClientSetupCard />
      <ConnectedClientsCard />
    </PageShell>
  )
}
