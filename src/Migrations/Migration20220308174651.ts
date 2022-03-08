/* eslint-disable */
import { Migration } from '@mikro-orm/migrations';

export class Migration20220308174651 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "score" drop constraint if exists "score_mods_check";');
    this.addSql('alter table "score" alter column "mods" type text[] using ("mods"::text[]);');
  }

  async down(): Promise<void> {
    this.addSql('alter table "score" drop constraint if exists "score_mods_check";');
    this.addSql('alter table "score" alter column "mods" type text[] using ("mods"::text[]);');
  }

}
