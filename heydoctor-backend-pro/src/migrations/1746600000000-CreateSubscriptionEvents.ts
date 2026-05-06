import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionEvents1746600000000 implements MigrationInterface {
  name = 'CreateSubscriptionEvents1746600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "subscription_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clinic_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "event_type" character varying(64) NOT NULL,
        "previous_plan" "subscriptions_plan_enum",
        "new_plan" "subscriptions_plan_enum",
        "previous_status" "subscriptions_status_enum",
        "new_status" "subscriptions_status_enum",
        "source" character varying(32) NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscription_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscription_events_clinic"
          FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_subscription_events_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_events_user_created_at"
      ON "subscription_events" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_subscription_events_user_created_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_events"`);
  }
}
