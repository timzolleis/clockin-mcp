import { Schema } from "effect";

export const TransactionId = Schema.String.pipe(Schema.brand("TransactionId"))
export type TransactionId = typeof TransactionId.Type
