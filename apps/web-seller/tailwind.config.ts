import { aradCrmPreset } from '@arad-crm/ui/tailwind-preset';
import type { Config } from 'tailwindcss';

export default {
  presets: [aradCrmPreset as Config],
  content: ['./src/**/*.{ts,tsx}'],
} satisfies Config;
