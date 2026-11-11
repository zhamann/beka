/**
 * The logo: a banknote with its portrait oval, drawn on Tabler's 24px grid so
 * it sits with the icons. Mirrored in `public/favicon.svg`; keep them in sync.
 */
export function BekaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <ellipse cx="12" cy="12" rx="2.75" ry="3.25" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}
