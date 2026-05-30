import { MotionConfig } from "motion/react"
import { ExamplePrompts } from "~/components/landing/ExamplePrompts"
import { Footer } from "~/components/landing/Footer"
import { Hero } from "~/components/landing/Hero"
import { HowItWorks } from "~/components/landing/HowItWorks"
import { Nav } from "~/components/landing/Nav"
import { Security } from "~/components/landing/Security"
import { Tools } from "~/components/landing/Tools"
import type { Route } from "./+types/home"

export function meta(_: Route.MetaArgs) {
  return [
    { title: "clockin-mcp — Track your time by just asking" },
    {
      name: "description",
      content:
        "A self-hostable MCP server that bridges Clockin time tracking to Claude and any MCP client. Clock in, switch projects, take breaks, and check your hours — in plain language.",
    },
  ]
}

export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-hidden bg-bg font-sans text-ink">
        <span id="top" />
        <Nav />
        <Hero />
        <ExamplePrompts />
        <HowItWorks />
        <Tools />
        <Security />
        <Footer />
      </div>
    </MotionConfig>
  )
}
