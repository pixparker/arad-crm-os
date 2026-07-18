CREATE TYPE "public"."account_status" AS ENUM('prospect', 'in_funnel', 'customer', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."activity_kind" AS ENUM('visit', 'call', 'sms', 'note', 'system');--> statement-breakpoint
CREATE TYPE "public"."commission_entry_status" AS ENUM('estimated', 'pending_finalization', 'earned', 'approved', 'payable', 'paid', 'reversed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."commission_entry_type" AS ENUM('earn', 'reversal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('full_time', 'part_time');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('pending', 'processed', 'skipped', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'assigned', 'in_progress', 'qualified', 'lost', 'future_followup');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."territory_kind" AS ENUM('city', 'region', 'neighborhood', 'custom');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"business_type" text,
	"phone" text,
	"contact_name" text,
	"contact_role" text,
	"instagram" text,
	"address_text" text,
	"region_text" text,
	"territory_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_rating" text,
	"status" "account_status" DEFAULT 'prospect' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mizro_business_ref" text,
	"mizro_plan" text,
	"mizro_subscription_status" text,
	"mizro_subscription_ends_at" timestamp with time zone,
	"total_paid_rial" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"seller_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"outcome" text,
	"note" text,
	"findings" jsonb,
	"next_action_type" text,
	"next_action_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"link_id" uuid,
	"source" text NOT NULL,
	"first_touch_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"payment_ref" text,
	"beneficiary_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"entry_type" "commission_entry_type" NOT NULL,
	"amount_rial" bigint NOT NULL,
	"plan_version_id" uuid,
	"account_id" uuid,
	"opportunity_id" uuid,
	"status" "commission_entry_status" DEFAULT 'earned' NOT NULL,
	"basis" jsonb NOT NULL,
	"reverses_entry_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_entry_status_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"from_status" "commission_entry_status",
	"to_status" "commission_entry_status" NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plan_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"producer" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "inbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"assigned_to" uuid,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"next_action_type" text,
	"next_action_at" timestamp with time zone,
	"close_reason" text,
	"requested_features" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_id" uuid,
	"owner_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"amount_estimate_rial" bigint,
	"win_reason" text,
	"loss_reason" text,
	"loss_note" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"won_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mobile" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "territory_kind" DEFAULT 'city' NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "territory_id" uuid;--> statement-breakpoint
ALTER TABLE "org_members" ADD COLUMN "contract_type" "contract_type" DEFAULT 'full_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_territory_id_territories_id_fk" FOREIGN KEY ("territory_id") REFERENCES "public"."territories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_claims" ADD CONSTRAINT "attribution_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_claims" ADD CONSTRAINT "attribution_claims_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_claims" ADD CONSTRAINT "attribution_claims_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_claims" ADD CONSTRAINT "attribution_claims_link_id_attribution_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."attribution_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_links" ADD CONSTRAINT "attribution_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_links" ADD CONSTRAINT "attribution_links_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_plan_version_id_commission_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."commission_plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry_status_audit" ADD CONSTRAINT "commission_entry_status_audit_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry_status_audit" ADD CONSTRAINT "commission_entry_status_audit_entry_id_commission_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entry_status_audit" ADD CONSTRAINT "commission_entry_status_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_versions" ADD CONSTRAINT "commission_plan_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_versions" ADD CONSTRAINT "commission_plan_versions_plan_id_commission_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commission_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_versions" ADD CONSTRAINT "commission_plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD CONSTRAINT "commission_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_org_phone_unique" ON "accounts" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_org_mizro_ref_unique" ON "accounts" USING btree ("organization_id","mizro_business_ref");--> statement-breakpoint
CREATE INDEX "accounts_org_territory_idx" ON "accounts" USING btree ("organization_id","territory_id");--> statement-breakpoint
CREATE INDEX "activities_org_account_idx" ON "activities" USING btree ("organization_id","account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activities_org_seller_idx" ON "activities" USING btree ("organization_id","seller_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_claims_org_account_unique" ON "attribution_claims" USING btree ("organization_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_links_token_unique" ON "attribution_links" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_links_org_seller_unique" ON "attribution_links" USING btree ("organization_id","seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_idempotency_unique" ON "commission_entries" USING btree ("organization_id","source_event_id","beneficiary_user_id","entry_type");--> statement-breakpoint
CREATE INDEX "commission_org_beneficiary_idx" ON "commission_entries" USING btree ("organization_id","beneficiary_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_no_unique" ON "commission_plan_versions" USING btree ("plan_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_producer_event_unique" ON "integration_events_inbox" USING btree ("producer","event_id");--> statement-breakpoint
CREATE INDEX "leads_org_assigned_idx" ON "leads" USING btree ("organization_id","assigned_to","status");--> statement-breakpoint
CREATE INDEX "leads_org_next_action_idx" ON "leads" USING btree ("organization_id","next_action_at");--> statement-breakpoint
CREATE INDEX "opps_org_owner_status_idx" ON "opportunities" USING btree ("organization_id","owner_id","status");--> statement-breakpoint
CREATE INDEX "otp_sessions_mobile_idx" ON "otp_sessions" USING btree ("mobile","created_at");--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_territory_id_territories_id_fk" FOREIGN KEY ("territory_id") REFERENCES "public"."territories"("id") ON DELETE no action ON UPDATE no action;