import { useState } from "react"
import { Form, Link, useNavigation } from "react-router"
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

export default function SignIn() {
  const navigation = useNavigation()
  const submitting = navigation.state === "submitting"
  const [error, setError] = useState<string | null>(null)

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back.</CardDescription>
        </CardHeader>
        <Form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            const fd = new FormData(e.currentTarget)
            const res = await authClient.signIn.email({
              email: String(fd.get("email")),
              password: String(fd.get("password")),
            })
            if (res.error) setError(res.error.message ?? "Sign in failed")
            else {
              const next = new URLSearchParams(window.location.search).get("next")
              window.location.assign(next ?? "/settings")
            }
          }}
        >
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" disabled={submitting} className="w-full">
              Sign in
            </Button>
            <p className="text-muted-foreground text-sm">
              No account?{" "}
              <Link to="/sign-up" className="text-primary underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Form>
      </Card>
    </main>
  )
}
