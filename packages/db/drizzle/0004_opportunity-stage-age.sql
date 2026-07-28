ALTER TABLE "opportunities" ADD COLUMN "stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Backfill from creation, not from the migration's clock: defaulting to now()
-- would tell every existing deal it just entered its stage, and «۰ روز در این
-- مرحله» on a deal that has been quiet for a month is worse than no number.
UPDATE "opportunities" SET "stage_entered_at" = "created_at";
