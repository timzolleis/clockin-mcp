import { effectTsResolver } from "@hookform/resolvers/effect-ts"
import { Schema } from "effect"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { Link } from "react-router"
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

const SignInSchema = Schema.Struct({
  email: EmailField,
  password: PasswordField,
})
type SignInValues = typeof SignInSchema.Type

export default function SignIn() {
  const form = useForm<SignInValues>({
    resolver: effectTsResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  })
  const [error, setError] = useState<string | null>(null)

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const res = await authClient.signIn.email(values)
    if (res.error) {
      setError(res.error.message ?? "Sign in failed")
      return
    }
    const next = new URLSearchParams(window.location.search).get("next")
    window.location.assign(next ?? "/settings")
  })

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back.</CardDescription>
        </CardHeader>
        <FormProvider {...form}>
          <form onSubmit={onSubmit}>
            <CardContent>
              <FieldGroup>
                <TextField<SignInValues>
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                />
                <TextField<SignInValues>
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </FieldGroup>
            </CardContent>
            <CardFooter className="mt-6 flex flex-col gap-3">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full"
              >
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-sm text-muted-foreground">
                No account?{" "}
                <Link to="/sign-up" className="text-primary underline">
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </form>
        </FormProvider>
      </Card>
    </main>
  )
}
