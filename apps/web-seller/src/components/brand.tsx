// The Mizro «سِیلز» lockup — the login art. SETTLED in the prototype: this is
// the mark, not a placeholder for an illustration or a photo.
//
// Inline SVG rather than a file: it is two paths, it must inherit currentColor
// on the navy canopy, and a login screen should not wait on a network round
// trip for its own logo.

export function MizroMark({ className = 'h-11 w-11' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M63 202Q53 202 53 192V70C53 63 58 58 65 58L114 108C122 116 134 116 142 108L191 58C198 58 203 63 203 70V192Q203 202 193 202"
          stroke="currentColor"
          strokeWidth="22"
        />
        <path d="M93 144h70M93 173h70M93 202h70" stroke="var(--ac-primary)" strokeWidth="13" />
      </g>
    </svg>
  );
}

export function BrandLockup({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const large = size === 'lg';
  return (
    <div
      className={
        large
          ? 'grid justify-items-center gap-4 text-center'
          : 'flex items-center gap-3 text-on-canopy'
      }
    >
      <MizroMark
        className={
          large
            ? 'h-[92px] w-[92px] text-on-canopy drop-shadow-[0_10px_26px_rgba(24,176,153,0.28)]'
            : 'h-11 w-11 text-on-canopy'
        }
      />
      <span className={large ? 'block' : 'leading-tight'}>
        <span
          className={`block font-bold tracking-tight text-on-canopy ${large ? 'text-[2rem]' : 'text-xl'}`}
        >
          میزرو سِیلز
        </span>
        <span
          className={`block font-medium text-primary ${large ? 'mt-2 text-[13px]' : 'text-xs'}`}
        >
          سامانهٔ فروش تیم میزرو
        </span>
      </span>
    </div>
  );
}
