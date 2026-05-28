import { Atom } from "@effect-atom/atom-react"
import { AtomV1ApiClient } from "~/features/api/client/api-client"

// Reactivity keys — mutations bump these to invalidate dependent queries.
export const CLOCKIN_STATUS_KEY = "clockinStatus" as const
export const CLOCKIN_CURRENT_KEY = "clockinCurrent" as const
export const CLOCKIN_WORKDAYS_KEY = "clockinWorkdays" as const
export const CLOCKIN_PROJECTS_KEY = "clockinProjects" as const
export const CLOCKIN_OVERVIEW_KEY = "clockinTotals" as const

// ---- Reads ----

export const clockinStatusAtom = AtomV1ApiClient.query("clockin", "status", {
  reactivityKeys: [CLOCKIN_STATUS_KEY],
})

export const clockinCurrentAtom = AtomV1ApiClient.query("clockin", "current", {
  reactivityKeys: [CLOCKIN_CURRENT_KEY, CLOCKIN_STATUS_KEY],
})

export const clockinWorkdaysAtom = AtomV1ApiClient.query("clockin", "workdays", {
  reactivityKeys: [CLOCKIN_WORKDAYS_KEY, CLOCKIN_STATUS_KEY],
})

export const clockinOverviewAtom = AtomV1ApiClient.query("clockin", "overview", {
  reactivityKeys: [CLOCKIN_OVERVIEW_KEY, CLOCKIN_STATUS_KEY],
})

export const clockinProjectsAtom = Atom.family((query: string) =>
  AtomV1ApiClient.query("clockin", "projects", {
    payload: { query: query || null },
    reactivityKeys: [CLOCKIN_PROJECTS_KEY, CLOCKIN_STATUS_KEY],
  }),
)

// ---- Mutations ----
//
// reactivityKeys are passed at call time, e.g.:
//   runClockIn({ reactivityKeys: EVENT_INVALIDATIONS })

export const EVENT_INVALIDATIONS = [
  CLOCKIN_CURRENT_KEY,
  CLOCKIN_WORKDAYS_KEY,
  CLOCKIN_OVERVIEW_KEY,
] as const

export const SETUP_INVALIDATIONS = [
  CLOCKIN_STATUS_KEY,
  CLOCKIN_CURRENT_KEY,
] as const

export const setupClockinMutation = AtomV1ApiClient.mutation("clockin", "setup")
export const clockInMutation = AtomV1ApiClient.mutation("clockin", "clockIn")
export const clockOutMutation = AtomV1ApiClient.mutation("clockin", "clockOut")
export const startBreakMutation = AtomV1ApiClient.mutation("clockin", "startBreak")
export const resumeWorkMutation = AtomV1ApiClient.mutation("clockin", "resumeWork")
export const startProjectMutation = AtomV1ApiClient.mutation("clockin", "startProject")
