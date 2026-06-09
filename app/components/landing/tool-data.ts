import {
  BarChart3,
  CalendarDays,
  Clock,
  Coffee,
  FolderKanban,
  ListChecks,
  LogOut,
  MoveHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"

// ---------------------------------------------------------------------------
// The actual tools the MCP server exposes (see app/lib/mcp.server.ts). This is
// the single source of truth shared by the Tools grid and the chat mockup's
// tool rail — every tool here has a worked example below.
// ---------------------------------------------------------------------------

export type ToolTag =
  | "current_status"
  | "clock_in"
  | "clock_out"
  | "start_break"
  | "resume_work"
  | "start_project_work"
  | "list_projects"
  | "list_workdays"
  | "time_overview"
  | "restructure_workday"
  | "adjust_slice"
  | "edit_segment"
  | "append_slice"

export interface Tool {
  tag: ToolTag
  Icon: LucideIcon
  /** One-line description, mirrors the tool's MCP `description`. */
  blurb: string
  /** Argument hint shown as a signature, or empty for no-arg tools. */
  args: string
}

export const TOOLS: Tool[] = [
  {
    tag: "current_status",
    Icon: Clock,
    blurb: "What am I doing right now — state, since-when, and the active project.",
    args: "",
  },
  { tag: "clock_in", Icon: Play, blurb: "Start the workday.", args: "" },
  { tag: "clock_out", Icon: LogOut, blurb: "End the workday.", args: "" },
  {
    tag: "start_break",
    Icon: Coffee,
    blurb: "Begin a break — time stops counting as work.",
    args: "",
  },
  {
    tag: "resume_work",
    Icon: RotateCcw,
    blurb: "Return from a break to general work time.",
    args: "",
  },
  {
    tag: "start_project_work",
    Icon: FolderKanban,
    blurb: "Start working on a project — clocks in first if you're clocked out.",
    args: "project_id",
  },
  {
    tag: "list_projects",
    Icon: ListChecks,
    blurb: "List or search the projects you can log time to.",
    args: "query?",
  },
  {
    tag: "list_workdays",
    Icon: CalendarDays,
    blurb: "Workdays rolled up with per-segment durations and totals — recent days or a specific date.",
    args: "date?",
  },
  {
    tag: "time_overview",
    Icon: BarChart3,
    blurb: "Week / month worked vs. target, flextime, and vacation balance.",
    args: "",
  },
  {
    tag: "restructure_workday",
    Icon: SlidersHorizontal,
    blurb: "Re-split a day's worked time across projects by percentage.",
    args: "buckets[]",
  },
  {
    tag: "adjust_slice",
    Icon: Pencil,
    blurb: "Resize one time slice — set it or grow it; the day ripples to match.",
    args: "slice_id, op",
  },
  {
    tag: "edit_segment",
    Icon: MoveHorizontal,
    blurb: "Move a segment's exact start and/or end — the only way to backdate a start.",
    args: "segment_id, started_at?",
  },
  {
    tag: "append_slice",
    Icon: Plus,
    blurb: "Add a slice at the end of a day, extending it.",
    args: "task, hours?",
  },
]

// ---------------------------------------------------------------------------
// Worked examples — one per tool. Drives the interactive chat mockup. `reply`
// is trusted inline HTML (small <b>/<code> emphasis only).
// ---------------------------------------------------------------------------

export type DemoCard =
  | {
      kind: "status"
      label: string
      since: string
      project?: string
    }
  | {
      kind: "confirm"
      tone: "good" | "iris"
      title: string
      detail?: string
    }
  | {
      kind: "overview"
      worked: string
      target: string
      toGo: string
      pct: number
      rows: { k: string; v: string; pos?: boolean }[]
    }
  | {
      kind: "projects"
      rows: { id: number; name: string; active?: boolean }[]
    }
  | {
      kind: "workdays"
      rows: { day: string; date: string; total: string; pct: number; project: string }[]
    }

export interface Example {
  prompt: string
  reply: string
  card?: DemoCard
}

export const EXAMPLES: Record<ToolTag, Example> = {
  current_status: {
    prompt: "What am I working on right now?",
    reply:
      'You\'re <b class="font-semibold text-ink">working on a project</b>, clocked in since <b class="font-semibold text-ink">09:14</b>.',
    card: {
      kind: "status",
      label: "Working on project",
      since: "09:14",
      project: "Acme · Redesign",
    },
  },
  clock_in: {
    prompt: "Clock me in.",
    reply: "Done — your workday is running.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Clocked in at 09:02",
      detail: "Nothing tracked to a project yet — just say the word.",
    },
  },
  clock_out: {
    prompt: "I'm done for the day.",
    reply: "Wrapped up. Here's the day:",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Clocked out at 17:36",
      detail:
        '<b class="text-ink">7h 48m</b> logged today across <b class="text-ink">2</b> projects.',
    },
  },
  start_break: {
    prompt: "Taking my lunch break.",
    reply: "Enjoy — the clock is paused.",
    card: {
      kind: "confirm",
      tone: "iris",
      title: "Break started at 12:30",
      detail: "Time stops counting as work until you're back.",
    },
  },
  resume_work: {
    prompt: "Back from lunch.",
    reply: "Welcome back.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Resumed work at 13:12",
      detail: 'You were away for <b class="text-ink">42m</b>.',
    },
  },
  start_project_work: {
    prompt: "Start my day on the Globex migration.",
    reply: "Clocked in and dropped you straight onto it.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Now tracking · Globex · Migration",
      detail: "Workday opened at 08:47 with the project already attached.",
    },
  },
  list_projects: {
    prompt: "What projects can I log to?",
    reply: "Here's what's on your plate:",
    card: {
      kind: "projects",
      rows: [
        { id: 482, name: "Acme · Redesign", active: true },
        { id: 511, name: "Globex · Migration" },
        { id: 333, name: "Internal · Ops" },
        { id: 294, name: "Initech · Support" },
      ],
    },
  },
  list_workdays: {
    prompt: "How did my week break down?",
    reply: "Day by day, here's where the hours went:",
    card: {
      kind: "workdays",
      rows: [
        { day: "Mon", date: "Jun 2", total: "8h 04m", pct: 100, project: "Acme" },
        { day: "Tue", date: "Jun 3", total: "7h 36m", pct: 94, project: "Globex" },
        { day: "Wed", date: "Jun 4", total: "8h 12m", pct: 100, project: "Acme" },
        { day: "Thu", date: "Jun 5", total: "7h 20m", pct: 90, project: "Internal" },
      ],
    },
  },
  time_overview: {
    prompt: "How many hours do I still need this week?",
    reply:
      'You\'ve worked <b class="font-semibold text-ink">31h 12m</b> of your 40h target. Where things stand:',
    card: {
      kind: "overview",
      worked: "31h 12m",
      target: "40h",
      toGo: "8h 48m",
      pct: 78,
      rows: [
        { k: "Remaining today", v: "2h 18m" },
        { k: "Flextime", v: "+2h 15m", pos: true },
        { k: "This month", v: "96h / 152h" },
        { k: "Vacation left", v: "18 days" },
      ],
    },
  },
  restructure_workday: {
    prompt: "Split today 50/50 between Acme and Globex.",
    reply: "Done — kept your hours the same and redistributed them.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Day restructured",
      detail:
        '<b class="text-ink">7h 30m</b> split <b class="text-ink">50/50</b> across Acme and Globex.',
    },
  },
  adjust_slice: {
    prompt: "Make that Acme block just an hour.",
    reply: "Updated — the rest of your day shifted to match.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Slice updated",
      detail: 'Acme is now <b class="text-ink">1h</b>; clock-out moved earlier.',
    },
  },
  edit_segment: {
    prompt: "I actually started at 08:40, not 08:58.",
    reply: "Moved your workday's start back to 08:40.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Segment updated",
      detail: 'Start now <b class="text-ink">08:40</b>; the rest of your day is untouched.',
    },
  },
  append_slice: {
    prompt: "I finished with 35 mins on Internal Ops.",
    reply: "Added it to the end of your day.",
    card: {
      kind: "confirm",
      tone: "good",
      title: "Slice added",
      detail: '<b class="text-ink">35m</b> on Internal · clock-out now 17:35.',
    },
  },
}
