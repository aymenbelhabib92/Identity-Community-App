CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"reply_to_id" uuid,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_notifications" text DEFAULT 'mentions' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_chat_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");