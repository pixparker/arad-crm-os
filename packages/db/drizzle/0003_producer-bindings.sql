CREATE TABLE "producer_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"producer" text NOT NULL,
	"external_ref" text DEFAULT 'default' NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "producer_bindings" ADD CONSTRAINT "producer_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_bindings" ADD CONSTRAINT "producer_bindings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "producer_bindings_producer_ref_unique" ON "producer_bindings" USING btree ("producer","external_ref");