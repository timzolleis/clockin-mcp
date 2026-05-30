import { Schema } from "effect"

/** Reusable effect-schema field definitions shared across the auth/setup forms. */

export const EmailField = Schema.String.pipe(
  Schema.minLength(1, { message: () => "Email is required" }),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => "Enter a valid email address",
  })
)

/** Existing password — only required, no strength rules (those belong to sign-up). */
export const PasswordField = Schema.String.pipe(
  Schema.minLength(1, { message: () => "Password is required" })
)

/** New password chosen during sign-up. */
export const NewPasswordField = Schema.String.pipe(
  Schema.minLength(8, {
    message: () => "Password must be at least 8 characters",
  })
)

export const NameField = Schema.String.pipe(
  Schema.minLength(1, { message: () => "Name is required" })
)
