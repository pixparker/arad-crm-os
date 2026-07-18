// Mizro cafe vertical — vertical #1 (ADR-010). A vertical contributes its own
// tables (mizro_* prefix, FKs to core aggregate roots only), pipeline/outcome
// presets (seeded from Phase-0 outputs), vertical visit-form fields, event
// handlers, and the Mizro partner-command client. Those land with the vertical
// epic; the manifest below is the registration seam the module registry
// (org_modules) will consume.

export interface VerticalManifest {
  key: string;
  label: string;
  version: number;
}

export const mizroVertical: VerticalManifest = {
  key: 'mizro',
  label: 'میزرو',
  version: 1,
};
