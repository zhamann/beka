/**
 * The logo: a beka, the ancient half-shekel stone weight, resting
 * on the double rule that marks a total. Drawn on Tabler's 24px grid so it sits
 * with the icons. Mirrored in `public/favicon.svg`; keep them in sync.
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
      <path d="M6 16.5c0-6 2.7-10 6-10s6 4 6 10" />
      <path d="M3.5 16.5h17M3.5 20h17" />
    </svg>
  )
}
