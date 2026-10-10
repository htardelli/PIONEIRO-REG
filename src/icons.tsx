import type { CSSProperties, ReactNode } from 'react'

/** Ícones de traço (2 px), um só estilo em todo o app — no lugar de emojis, que mudam de aparelho para aparelho. */
const PATHS = {
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.2v.1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
  pin: <><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>,
  calendarDown: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v5M9.5 15.5 12 18l2.5-2.5" /></>,
  list: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  select: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12.5 2.8 2.8L16 10" /></>,
  hourglass: <><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 18M17 3c0 5-10 6-10 18" /></>,
}
export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, style, label }: { name: IconName; size?: number; style?: CSSProperties; label?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ verticalAlign: '-0.15em', flexShrink: 0, ...style }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {PATHS[name]}
    </svg>
  )
}
