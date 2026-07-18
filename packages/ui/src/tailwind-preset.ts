// Tailwind preset consuming the CSS-var tokens — apps stay brand-agnostic;
// the brand swap happens in styles/tokens.css only (ADR-009).

import type { Config } from 'tailwindcss';

const tokenColor = (name: string): string => `var(--ac-${name})`;

export const aradCrmPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: tokenColor('bg'),
        surface: tokenColor('surface'),
        'surface-2': tokenColor('surface-2'),
        'surface-3': tokenColor('surface-3'),
        fg: tokenColor('fg'),
        'fg-muted': tokenColor('fg-muted'),
        'fg-faint': tokenColor('fg-faint'),
        border: tokenColor('border'),
        'border-strong': tokenColor('border-strong'),
        primary: tokenColor('primary'),
        'primary-ink': tokenColor('primary-ink'),
        'primary-soft': tokenColor('primary-soft'),
        'primary-fg': tokenColor('primary-fg'),
        gold: tokenColor('gold'),
        'gold-soft': tokenColor('gold-soft'),
        success: tokenColor('success'),
        'success-soft': tokenColor('success-soft'),
        warning: tokenColor('warning'),
        'warning-soft': tokenColor('warning-soft'),
        danger: tokenColor('danger'),
        'danger-soft': tokenColor('danger-soft'),
        // pipeline stage hues (chip fg + soft fill pairs)
        'st-new': tokenColor('st-new'),
        'st-new-soft': tokenColor('st-new-soft'),
        'st-contact': tokenColor('st-contact'),
        'st-contact-soft': tokenColor('st-contact-soft'),
        'st-demo': tokenColor('st-demo'),
        'st-demo-soft': tokenColor('st-demo-soft'),
        'st-nego': tokenColor('st-nego'),
        'st-nego-soft': tokenColor('st-nego-soft'),
        'st-won': tokenColor('st-won'),
        'st-won-soft': tokenColor('st-won-soft'),
        'st-lost': tokenColor('st-lost'),
        'st-lost-soft': tokenColor('st-lost-soft'),
      },
      borderRadius: {
        sm: 'var(--ac-radius-sm)',
        md: 'var(--ac-radius-md)',
        lg: 'var(--ac-radius-lg)',
        full: 'var(--ac-radius-full)',
      },
      boxShadow: {
        // token-driven elevation — `shadow-card` floats a surface, `shadow-pop`
        // is the lifted (hover / dragging) state.
        card: 'var(--ac-shadow)',
        pop: 'var(--ac-shadow-lg)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, var(--ac-primary), var(--ac-primary-grad-to))',
      },
      fontFamily: {
        fa: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
    },
  },
};

export default aradCrmPreset;
