// Tailwind preset consuming the CSS-var tokens — apps stay brand-agnostic;
// the brand swap happens in styles/tokens.css only (ADR-009).

import type { Config } from 'tailwindcss';

export const aradCrmPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--ac-bg)',
        surface: 'var(--ac-surface)',
        'surface-2': 'var(--ac-surface-2)',
        fg: 'var(--ac-fg)',
        'fg-muted': 'var(--ac-fg-muted)',
        border: 'var(--ac-border)',
        primary: 'var(--ac-primary)',
        'primary-fg': 'var(--ac-primary-fg)',
        success: 'var(--ac-success)',
        warning: 'var(--ac-warning)',
        danger: 'var(--ac-danger)',
      },
      borderRadius: {
        sm: 'var(--ac-radius-sm)',
        md: 'var(--ac-radius-md)',
        lg: 'var(--ac-radius-lg)',
        full: 'var(--ac-radius-full)',
      },
      fontFamily: {
        fa: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
    },
  },
};

export default aradCrmPreset;
