import { useFormContext, type FieldValues, type Path } from "react-hook-form"

import { Input } from "~/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field"

type TextFieldProps<T extends FieldValues> = Omit<
  React.ComponentProps<typeof Input>,
  "name"
> & {
  name: Path<T>
  label: string
  description?: string
}

/**
 * A single labelled text input bound to the surrounding react-hook-form context.
 * Renders validation state through the `Field` primitives.
 */
export function TextField<T extends FieldValues>({
  name,
  label,
  description,
  ...inputProps
}: TextFieldProps<T>) {
  const {
    register,
    formState: { errors },
  } = useFormContext<T>()
  const error = errors[name] as { message?: string } | undefined

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        aria-invalid={Boolean(error)}
        {...register(name)}
        {...inputProps}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={error ? [error] : undefined} />
    </Field>
  )
}
