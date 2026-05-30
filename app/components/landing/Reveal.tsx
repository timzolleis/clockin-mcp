import { motion } from "motion/react"
import type { ReactNode } from "react"

/**
 * Fade-and-rise that triggers once when scrolled into view. Built on
 * motion/react — honors prefers-reduced-motion automatically via the
 * <MotionConfig reducedMotion="user"> wrapper on the page.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}
