// The Arad mark — an A drawn as two strokes. Lives in its own file because the
// sidebar and the login screen both need it, and a second hand-copy is how the
// two drift into slightly different logos.
//
// `currentColor` throughout: the mark takes the colour of whatever tile it sits
// in (white on the canopy rail, primary-fg on the login's gradient chip) rather
// than carrying a colour of its own.
export function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 19 12 4l8 15"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 14h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
