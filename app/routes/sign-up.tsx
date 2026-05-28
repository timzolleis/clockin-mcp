import { useState } from "react"
import { Form, Link, redirect, useNavigation } from "react-router"
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

export default function SignUp() {
  const navigation = useNavigation()
  const submitting = navigation.state === "submitting"
  const [error, setError] = useState<string | null>(null)

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Sign up to add your upstream API token.</CardDescription>
        </CardHeader>
        <Form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            const fd = new FormData(e.currentTarget)
            const res = await authClient.signUp.email({
              email: String(fd.get("email")),
              password: String(fd.get("password")),
              name: String(fd.get("name") ?? ""),
            })
            if (res.error) setError(res.error.message ?? "Sign up failed")
            else window.location.assign("/settings")
          }}
        >
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" disabled={submitting} className="w-full">
              Sign up
            </Button>
            <p className="text-muted-foreground text-sm">
              Already have an account?{" "}
              <Link to="/sign-in" className="text-primary underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Form>
      </Card>
    </main>
  )
}
