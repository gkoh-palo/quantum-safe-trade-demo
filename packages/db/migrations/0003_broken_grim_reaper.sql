ALTER TABLE "crypto_config" ADD COLUMN "auto_generate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_config" ADD COLUMN "auto_tick" boolean DEFAULT false NOT NULL;