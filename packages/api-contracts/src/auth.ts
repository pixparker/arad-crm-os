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

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    phone: z.string(),
    display_name: z.string(),
  }),
  membership: z.object({
    organization_id: z.string(),
    organization_name: z.string(),
    role: roleSchema,
    contract_type: contractTypeSchema,
    territory_id: z.string().nullable(),
    territory_name: z.string().nullable(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
