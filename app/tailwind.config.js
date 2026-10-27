/** Tailwind mapping for the design tokens (see replica/design/tokens.css).
 *  Semantic classes only — bg-surface, text-muted, border-border — never raw hex. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: "var(--color-bg)",
      surface: "var(--color-surface)",
      "surface-raised": "var(--color-surface-raised)",
      border: "var(--color-border)",
      "border-input": "var(--color-border-input)",
      text: "var(--color-text)",
      muted: "var(--color-text-muted)",
      accent: "var(--color-accent)",
      "accent-hover": "var(--color-accent-hover)",
      "on-accent": "var(--color-on-accent)",
      danger: "var(--color-danger)",
      success: "var(--color-success)",
      warning: "var(--color-warning)",
      focus: "var(--color-focus)",
      label: {
        gray: "var(--label-gray)", red: "var(--label-red)",
        orange: "var(--label-orange)", amber: "var(--label-amber)",
        green: "var(--label-green)", teal: "var(--label-teal)",
        blue: "var(--label-blue)", purple: "var(--label-purple)",
        pink: "var(--label-pink)",
      },
    },
    fontFamily: {
      sans: "var(--font-sans)",
      mono: "var(--font-mono)",
    },
    fontSize: {
      xs: ["var(--text-xs)", { lineHeight: "var(--leading-xs)", fontWeight: "500" }],
      sm: ["var(--text-sm)", { lineHeight: "var(--leading-sm)" }],
      base: ["var(--text-base)", { lineHeight: "var(--leading-base)" }],
      lg: ["var(--text-lg)", { lineHeight: "var(--leading-lg)", fontWeight: "600" }],
      xl: ["var(--text-xl)", { lineHeight: "var(--leading-xl)", fontWeight: "700" }],
      display: ["var(--text-display)", { lineHeight: "var(--leading-display)", fontWeight: "700" }],
    },
    extend: {
      spacing: {
        1: "var(--space-1)", 2: "var(--space-2)", 3: "var(--space-3)",
        4: "var(--space-4)", 5: "var(--space-5)", 6: "var(--space-6)",
        8: "var(--space-8)", 10: "var(--space-10)", 12: "var(--space-12)",
        16: "var(--space-16)",
      },
      borderRadius: {
        sm: "var(--radius-sm)", md: "var(--radius-md)",
        lg: "var(--radius-lg)", pill: "var(--radius-pill)",
      },
      boxShadow: { card: "var(--shadow-card)", pop: "var(--shadow-pop)" },
      transitionTimingFunction: { ease: "var(--motion-ease)" },
      width: { sidebar: "var(--layout-sidebar)", "kanban-column": "var(--layout-kanban-column)" },
      height: { header: "var(--layout-header)" },
      maxWidth: { content: "var(--layout-content-max)", "card-modal": "var(--layout-card-modal)" },
    },
  },
  plugins: [],
};
