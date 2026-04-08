ALTER TYPE "public"."metadata_source" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "model_aliases" ADD COLUMN "metadata_overrides" jsonb;