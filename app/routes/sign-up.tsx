import { effectTsResolver } from "@hookform/resolvers/effect-ts"
import { Schema } from "effect"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { Link } from "react-router"
import { authClient } from "~/lib/auth-client"
import { EmailField, NameField, NewPasswordField } from "~/lib/forms/fields"
import { TextField } from "~/components/form/text-field"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardFooter } from "~/components/ui/card"
import { FieldError, FieldGroup } from "~/components/ui/field"
import type { Route } from "./+types/sign-up"

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sign up — clockin-mcp" }]
}

const SignUpSchema = Schema.Struct({
  name: NameField,
  email: EmailField,
  password: NewPasswordField,
})
type SignUpValues = typeof SignUpSchema.Type

export default function SignUp() {
  const form = useForm<SignUpValues>({
    resolver: effectTsResolver(SignUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  })
  const [error, setError] = useState<string | null>(null)

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const res = await authClient.signUp.email(values)
    if (res.error) {
      setError(res.error.message ?? "Sign up failed")
      return
    }
    window.location.assign("/settings")
  })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="font-heading text-3xl font-medium tracking-tight">
          Get started
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create an account to connect your Clockin workspace.
        </p>
      </div>
      <Card className="w-full">
        <FormProvider {...form}>
          <form onSubmit={onSubmit}>
            <CardContent>
              <FieldGroup>
                <TextField<SignUpValues>
                  name="name"
                  label="Name"
                  autoComplete="name"
                  autoFocus
                />
                <TextField<SignUpValues>
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                />
                <TextField<SignUpValues>
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  description="At least 8 characters."
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
                {form.formState.isSubmitting ? "Creating account…" : "Sign up"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/sign-in" className="text-primary underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </FormProvider>
      </Card>
    </main>
  )
}
