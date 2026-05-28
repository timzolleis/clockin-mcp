import { Effect } from "effect"
import { ClockinApiClient } from "./client"
import {
  CorrectionWriteResponse,
  EventInput,
  WorkdayArrayResponse,
} from "./schemas"

export class ClockinCorrections extends Effect.Service<ClockinCorrections>()(
  "ClockinCorrections",
  {
    effect: Effect.gen(function* () {
      const api = yield* ClockinApiClient
      return {
        list: () =>
          api
            .get("/correction", WorkdayArrayResponse)
            .pipe(Effect.map((r) => r.data)),
        storeEvent: (event: EventInput) =>
          api.post(
            "/correction/storeEvent",
            api.encodeBody(EventInput, event),
            CorrectionWriteResponse,
          ),
        updateEvent: (
          eventId: string | number,
          fields: Partial<EventInput>,
        ) =>
          api.patch(
            `/correction/updateEvent/${eventId}`,
            fields,
            CorrectionWriteResponse,
          ),
        deleteEvent: (eventId: string | number) =>
          api.del(
            `/correction/deleteEvent/${eventId}`,
            CorrectionWriteResponse,
          ),
        undo: (transactionId: string | number) =>
          api.patch(
            `/correction/undo/${transactionId}`,
            {},
            CorrectionWriteResponse,
          ),
      }
    }),
    dependencies: [ClockinApiClient.Default],
  },
) {}
