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

export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3l1.5-2h7.4l1.5 2h2.3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className}>
      <path d="M9.5 6l6 6-6 6" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2.6} className={className}>
      <path d="M6 12.5l4 4 8-9" />
    </svg>
  )
}

export function MicIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  )
}

export function BarcodeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M8.5 8.5v7M12 8.5v7M15.5 8.5v7" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} className={className}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function SnowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />
    </svg>
  )
}
