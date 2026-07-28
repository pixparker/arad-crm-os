import { aradCrmPreset } from '@arad-crm/ui/tailwind-preset';
import opsKitPreset from '@arad/ops-kit/tailwind-preset';
import type { Config } from 'tailwindcss';

// The control plane composes two presets:
//   · aradCrmPreset — the product's semantic tokens (surface, fg, border…), so
//     the ops panel and the seller app agree on what "muted text" means.
//   · opsKitPreset  — the back-office layer: shadow-card, glass, mesh-gradient,
//     .ops-focus, .ops-themed-scroll, nav-active-indicator, the entrance
//     animations, and the three ops-* colours that read from the CSS variables
//     set in globals.css.
export default {
  presets: [aradCrmPreset as Config, opsKitPreset as Config],
  // 🔒 The kit's own files MUST be scanned. Tailwind only emits classes it can
  // see in `content`, and these packages ship source, not compiled CSS — so a
  // class used only inside OpsShell/BottomSheet/primitives is silently dropped
  // and the component renders unstyled. That is how the ＋ overlay lost its
  // padding and its bottom anchoring: `p-5`, `bg-black/45`, `max-h-[88dvh]` and
  // `rounded-t-[28px]` appear nowhere in an app's own src, so they were never
  // generated. Any new shared package with classNames belongs in this list.
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../foundation/packages/ops-kit/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
