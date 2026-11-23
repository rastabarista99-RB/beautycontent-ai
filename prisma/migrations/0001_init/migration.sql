-- BeautyContent AI PostgreSQL initial schema (Prisma migration)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "businesses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'beauty_salon',
    "city" TEXT,
    "description" TEXT,
    "target_audience" TEXT,
    "tone_of_voice" TEXT,
    "brand_description" TEXT,
    "brand_advantages" TEXT,
    "preferred_phrases" TEXT,
    "forbidden_phrases" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "title" TEXT,
    "prompt" TEXT,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_type_check" CHECK ("type" IN ('post', 'story', 'reels', 'ad')),
    CONSTRAINT "projects_status_check" CHECK ("status" IN ('draft', 'saved'))
);

CREATE TABLE "generations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generation_daily_usage" (
    "user_id" UUID NOT NULL,
    "usage_date_utc" DATE NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "generation_daily_usage_pkey" PRIMARY KEY ("user_id","usage_date_utc"),
    CONSTRAINT "generation_daily_usage_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "businesses_user_id_key" ON "businesses"("user_id");
CREATE UNIQUE INDEX "businesses_id_user_id_key" ON "businesses"("id", "user_id");
CREATE INDEX "services_business_id_idx" ON "services"("business_id");
CREATE INDEX "projects_user_id_updated_at_created_at_idx" ON "projects"("user_id", "updated_at" DESC, "created_at" DESC);

ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "services" ADD CONSTRAINT "services_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_business_id_user_id_fkey"
    FOREIGN KEY ("business_id", "user_id") REFERENCES "businesses"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generations" ADD CONSTRAINT "generations_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generation_daily_usage" ADD CONSTRAINT "generation_daily_usage_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
