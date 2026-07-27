import { z } from 'zod';

export const requestOtpBodySchema = z.object({
  mobile: z.string().min(5).max(20),
});

export const requestOtpResponseSchema = z.object({
  ok: z.literal(true),
  expires_at: z.string().datetime(),
  cooldown_sec: z.number().int(),
});

export const verifyOtpBodySchema = z.object({
  mobile: z.string().min(5).max(20),
  code: z.string().min(4).max(10),
});

export const roleSchema = z.enum([
  'visitor_seller',
  'followup_seller',
  'sales_manager',
  'owner_admin',
  'deployment_ops',
  'finance',
]);
export type Role = z.infer<typeof roleSchema>;

export const contractTypeSchema = z.enum(['full_time', 'part_time']);
export type ContractType = z.infer<typeof contractTypeSchema>;

// One resolved workspace = one org membership (E01-F06). A user may hold
// several; `membership` below is whichever one is currently active.
export const workspaceSchema = z.object({
  organization_id: z.string(),
  organization_name: z.string(),
  role: roleSchema,
  contract_type: contractTypeSchema,
  territory_id: z.string().nullable(),
  territory_name: z.string().nullable(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    phone: z.string(),
    display_name: z.string(),
  }),
  // The active workspace. Kept as `membership` so every existing surface keeps
  // working; `workspaces` is what the selector renders.
  membership: workspaceSchema,
  // 🔒 Every workspace this user may act in, resolved from org_members at
  // request time — never from client input. One ⇒ the app lands straight on
  // the dashboard; more ⇒ it shows the selector; zero ⇒ /me is 403
  // `no_workspace`, never a blank dashboard.
  workspaces: z.array(workspaceSchema),
  is_ops: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const selectWorkspaceBodySchema = z.object({
  organization_id: z.string().uuid(),
});
