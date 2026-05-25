CREATE TABLE "context_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"added_by_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"permission" text DEFAULT 'shared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_resources_kind_check" CHECK ("context_resources"."kind" in ('text', 'file')),
	CONSTRAINT "context_resources_permission_check" CHECK ("context_resources"."permission" in ('private', 'shared')),
	CONSTRAINT "context_resources_size_check" CHECK ("context_resources"."size_bytes" >= 0 and "context_resources"."size_bytes" <= 102400),
	CONSTRAINT "context_resources_content_bytes_check" CHECK (octet_length("context_resources"."content") <= 102400)
);
--> statement-breakpoint
ALTER TABLE "context_resources" ADD CONSTRAINT "context_resources_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_resources" ADD CONSTRAINT "context_resources_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;