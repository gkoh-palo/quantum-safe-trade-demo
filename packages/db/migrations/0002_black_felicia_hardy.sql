ALTER TABLE "harvested_packets" ADD COLUMN "scheme" text;--> statement-breakpoint
ALTER TABLE "harvested_packets" ADD COLUMN "envelope" jsonb;