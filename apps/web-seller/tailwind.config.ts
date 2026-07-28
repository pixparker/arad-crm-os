import { aradCrmPreset } from '@arad-crm/ui/tailwind-preset';
import type { Config } from 'tailwindcss';

export default {
  presets: [aradCrmPreset as Config],
  // 🔒 The kit's own files MUST be scanned. Tailwind only emits classes it can
  // see in `content`, and `@arad-crm/ui` ships source, not compiled CSS — so a
  // class used only inside BottomSheet/Modal/primitives is silently dropped and
  // the component renders unstyled. That is how the ＋ overlay lost its padding
  // and its bottom anchoring: `p-5`, `bg-black/45`, `max-h-[88dvh]` and
  // `rounded-t-[28px]` appear nowhere in an app's own src, so they were never
  // generated. Any new shared package with classNames belongs in this list.
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
} satisfies Config;
