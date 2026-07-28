// Minimal inline stroke icons (24×24 viewBox) — no icon dependency.

interface IconProps {
  className?: string | undefined;
}

const base = (className: string | undefined) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: className ?? 'h-5 w-5',
  'aria-hidden': true,
});

export const SunIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
);

export const FunnelIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
  </svg>
);

export const FolderIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);

export const WalletIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H3" />
    <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18M8.5 15l2 2 4-4" />
  </svg>
);

export const UserIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const PhoneIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const StoreIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 9 5.5 4h13L20 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M4 9h16M9 20v-6h6v6" />
  </svg>
);

export const NoteIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);

export const CopyIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

export const ChevronLeftIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m14 6-6 6 6 6" />
  </svg>
);

export const ClockIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const GearIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1" />
  </svg>
);
