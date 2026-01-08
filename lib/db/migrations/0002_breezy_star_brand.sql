CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appId" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"status" varchar(20) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_appId_apps_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;