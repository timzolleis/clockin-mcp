import { Schema } from "effect";

// The upstream `/correction` responses return `transactionId` as a number.
export const TransactionId = Schema.Number.pipe(Schema.brand("TransactionId"))
export type TransactionId = typeof TransactionId.Type
