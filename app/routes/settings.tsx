import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { effectTsResolver } from "@hookform/resolvers/effect-ts"
import { Schema } from "effect"
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
import {
  clockinStatusAtom,
  setupClockinMutation,
  SETUP_INVALIDATIONS,
} from "~/features/clockin/atoms/clockin-atoms"

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

function StatusBadge() {
  const status = useAtomValue(clockinStatusAtom)
  return Result.builder(status)
    .onInitial(() => (
      <span className="text-sm text-muted-foreground">Loading…</span>
    ))
    .onFailure(() => (
      <span className="text-sm text-destructive">Status unavailable</span>
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
        <span className="text-sm text-muted-foreground">Not configured</span>
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
        <CardTitle>Connect to Clockin</CardTitle>
        <CardDescription>
          We log in to Clockin on your behalf and store the resulting tokens
          encrypted (AES-256-GCM). Your password is never persisted.
        </CardDescription>
        <div className="pt-2">
          <StatusBadge />
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
        <code className="block rounded-md bg-muted px-3 py-2 text-sm break-all">
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
              authClient
                .signOut()
                .then(() => window.location.assign("/sign-in"))
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
