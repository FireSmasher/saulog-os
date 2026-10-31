// Line icons drawn for this app (24px grid, 1.8 stroke), no icon library.
type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function KainIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3v6a2 2 0 0 0 4 0V3" />
      <path d="M8 9v12" />
      <path d="M16.5 21V3c-2 1.2-3 3.6-3 6.5 0 2.3 1.2 3.5 3 3.5" />
    </svg>
  )
}

export function BuhatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7.5 7.5l9 9" />
      <path d="M5 10l5-5" />
      <path d="M3.5 8.5l5-5" />
      <path d="M14 19l5-5" />
      <path d="M15.5 20.5l5-5" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function FlameIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} width={16} height={16}>
      <path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.4-2.4-5.6-4-8.3-.4 2-1.4 3.2-2.7 3.9C11.5 7.6 10.4 5 8.5 3c.3 3.6-3 5.8-3 11.4C5.5 18.3 8.1 21 12 21Z" />
    </svg>
  )
}
