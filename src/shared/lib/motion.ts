/**
 * Meguruto motion system.
 * Single source of truth for animation classes.
 *
 * Duration tiers:
 *   fast   = 150ms  (micro-interactions, hover states)
 *   normal = 250ms  (page transitions, reveals)
 *   slow   = 400ms  (celebrations, emphasis)
 */

export const motion = {
  /** Page mount: fade-in-up, normal (250ms) */
  pageEnter: "animate-page-enter",

  /** Card hover: shadow lift + subtle rise, fast (150ms) */
  cardHover:
    "transition-all duration-150 hover:shadow-hover hover:-translate-y-0.5",

  /** Drawer slide-in, normal (250ms) */
  drawerSlide: "animate-drawer-slide",

  /** Badge unlock: radial glow + scale pop, slow (400ms) */
  badgeUnlock: "animate-badge-unlock",

  /** Progress bar fill, slow (400ms) */
  progressFill: "animate-progress-fill",

  /** Stagger delay for list items */
  stagger: (index: number, baseDelay = 50) =>
    ({ style: { animationDelay: `${index * baseDelay}ms` } }) as const,
} as const;
