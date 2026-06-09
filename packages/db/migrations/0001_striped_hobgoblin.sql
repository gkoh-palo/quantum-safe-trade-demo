ALTER TABLE "crypto_config" ADD COLUMN "keyring" jsonb;--> statement-breakpoint
ALTER TABLE "wire_messages" ADD COLUMN "mac" "bytea";