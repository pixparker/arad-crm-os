CREATE TYPE "public"."flow_enrollment_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."flow_entity_kind" AS ENUM('lead', 'opportunity', 'account');--> statement-breakpoint
CREATE TYPE "public"."flow_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."flow_step_decision" AS ENUM('accepted', 'overridden', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."ops_role" AS ENUM('super_admin', 'onboarding_agent', 'support', 'finance');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "connection_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"event" text NOT NULL,
	"actor_ops_user_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connection_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"purpose" text NOT NULL,
	"provider_template_ref" text NOT NULL,
	"code_var_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"capabilities" text[] NOT NULL,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cred_hint" text,
	"encrypted_dek" "bytea" NOT NULL,
	"dek_nonce" "bytea" NOT NULL,
	"encrypted_creds" "bytea" NOT NULL,
	"creds_nonce" "bytea" NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_ops_user_id" uuid,
	"updated_by_ops_user_id" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flow_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"entity_kind" "flow_entity_kind" NOT NULL,
	"status" "flow_status" DEFAULT 'active' NOT NULL,
	"current_version_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_kind" "flow_entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"status" "flow_enrollment_status" DEFAULT 'active' NOT NULL,
	"enrolled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flow_step_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"suggested_action_type" text,
	"suggested_at" timestamp with time zone,
	"chosen_action_type" text,
	"chosen_at" timestamp with time zone,
	"decision" "flow_step_decision" NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_user_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "ops_role" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "vertical_key" text DEFAULT 'mizro' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_ops" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_actor_ops_user_id_users_id_fk" FOREIGN KEY ("actor_ops_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_templates" ADD CONSTRAINT "connection_templates_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_templates" ADD CONSTRAINT "connection_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_created_by_ops_user_id_users_id_fk" FOREIGN KEY ("created_by_ops_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_updated_by_ops_user_id_users_id_fk" FOREIGN KEY ("updated_by_ops_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_definitions" ADD CONSTRAINT "flow_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_definitions" ADD CONSTRAINT "flow_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollments" ADD CONSTRAINT "flow_enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollments" ADD CONSTRAINT "flow_enrollments_flow_version_id_flow_versions_id_fk" FOREIGN KEY ("flow_version_id") REFERENCES "public"."flow_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollments" ADD CONSTRAINT "flow_enrollments_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_step_decisions" ADD CONSTRAINT "flow_step_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_step_decisions" ADD CONSTRAINT "flow_step_decisions_enrollment_id_flow_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."flow_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_step_decisions" ADD CONSTRAINT "flow_step_decisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_definition_id_flow_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."flow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_user_roles" ADD CONSTRAINT "ops_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_user_roles" ADD CONSTRAINT "ops_user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_events_conn_time_idx" ON "connection_events" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_templates_alias_unique" ON "connection_templates" USING btree ("connection_id","alias");--> statement-breakpoint
CREATE INDEX "connections_type_status_idx" ON "connections" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_definitions_org_key_unique" ON "flow_definitions" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_enrollments_org_entity_unique" ON "flow_enrollments" USING btree ("organization_id","entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "flow_step_decisions_enrollment_idx" ON "flow_step_decisions" USING btree ("enrollment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_versions_definition_no_unique" ON "flow_versions" USING btree ("definition_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_user_roles_user_role_unique" ON "ops_user_roles" USING btree ("user_id","role");