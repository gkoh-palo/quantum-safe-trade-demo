CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"event" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "crypto_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"scheme" text NOT NULL,
	"era" text DEFAULT 'classical' NOT NULL,
	"crqc_progress" integer DEFAULT 0 NOT NULL,
	"break_mode" text DEFAULT 'projected' NOT NULL,
	"kem_public_key" "bytea",
	"kem_secret_ref" text,
	"classical_pub" "bytea",
	"classical_priv_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvested_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wire_message_id" uuid NOT NULL,
	"harvested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"broken" boolean DEFAULT false NOT NULL,
	"break_method" text,
	"recovered_plaintext" jsonb,
	"broken_at" timestamp with time zone,
	"exposed_notional" numeric(20, 2),
	"exposed_counterparty" text
);
--> statement-breakpoint
CREATE TABLE "mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_trade_id" uuid NOT NULL,
	"target_trade_id" uuid,
	"direction" text NOT NULL,
	"rules_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system" text NOT NULL,
	"asset_class" text NOT NULL,
	"product" text NOT NULL,
	"counterparty" text NOT NULL,
	"notional" numeric(20, 2) NOT NULL,
	"currency" text NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"tenor" text NOT NULL,
	"trade_date" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payload_json" jsonb NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "wire_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_service" text NOT NULL,
	"to_service" text NOT NULL,
	"scheme" text NOT NULL,
	"era_at_send" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"nonce" "bytea",
	"encapsulated_key" "bytea",
	"signature" "bytea",
	"sig_scheme" text,
	"plaintext_sha256" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
