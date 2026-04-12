CREATE TABLE "users" (
    "oid" text PRIMARY KEY NOT NULL,
    "email" text NOT NULL,
    "display_name" text DEFAULT '' NOT NULL,
    "created_at" timestamp
    with
        time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp
    with
        time zone DEFAULT now() NOT NULL
);