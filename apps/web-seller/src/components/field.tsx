'use client';

// Form field with inline validation slots (ux-best-practices/inline-form-
// validation): message adjacent to the field, aria-invalid + describedby.

import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  hint?: string | undefined;
}

export const inputClass = (hasError: boolean): string =>
  `w-full rounded-md border bg-surface px-3.5 py-3 text-base text-fg outline-none transition-colors placeholder:text-fg-muted/60 focus:border-primary ${
    hasError ? 'border-danger' : 'border-border'
  }`;

export function TextField({ label, required, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={inputClass(Boolean(error))}
        {...input}
      />
      {error ? (
        <p id={messageId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { code: string; label: string }[];
  placeholder?: string | undefined;
  required?: boolean | undefined;
  error?: string | undefined;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  error,
}: SelectFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${inputClass(Boolean(error))} appearance-none`}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/** Tappable selection chip — the quick-log building block (big touch targets). */
export function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
        selected
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border bg-surface text-fg hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
