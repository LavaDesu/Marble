/* eslint-disable */
import { Migration } from '@mikro-orm/migrations';

export class Migration20220220094013 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table "league" ("name" varchar(255) not null, "deleted" timestamptz(3) null);');
    this.addSql('create index "league_deleted_index" on "league" ("deleted");');
    this.addSql('alter table "league" add constraint "league_pkey" primary key ("name");');

    this.addSql('create table "map" ("id" serial primary key, "deleted" timestamptz(3) null, "mod_expression" varchar(255) null, "set_id" int not null, "week" smallint not null, "artist" varchar(255) not null, "diff" varchar(255) not null, "scoreable" boolean not null, "title" varchar(255) not null, "max_combo" smallint not null, "league_name" varchar(255) not null);');
    this.addSql('create index "map_deleted_index" on "map" ("deleted");');

    this.addSql('create table "user" ("id" serial primary key, "deleted" timestamptz(3) null, "discord_id" varchar(255) not null, "username" varchar(255) not null, "last_play_id" bigint not null, "league_name" varchar(255) not null);');
    this.addSql('create index "user_deleted_index" on "user" ("deleted");');
    this.addSql('alter table "user" add constraint "user_discord_id_unique" unique ("discord_id");');
    this.addSql('alter table "user" add constraint "user_username_unique" unique ("username");');

    this.addSql('create table "score" ("id" bigserial primary key, "deleted" timestamptz(3) null, "best_id" bigint null, "created_at" timestamptz(3) not null, "mods" text[] not null, "rank" text check ("rank" in (\'D\', \'C\', \'B\', \'A\', \'S\', \'SH\', \'X\', \'XH\')) not null, "accuracy" real not null, "combo" smallint not null, "score" int not null, "count300" smallint not null, "count100" smallint not null, "count50" smallint not null, "countmiss" smallint not null, "map_id" int not null, "user_id" int not null);');
    this.addSql('create index "score_deleted_index" on "score" ("deleted");');
    this.addSql('create index "score_map_id_user_id_index" on "score" ("map_id", "user_id");');

    this.addSql('alter table "map" add constraint "map_league_name_foreign" foreign key ("league_name") references "league" ("name") on update cascade;');

    this.addSql('alter table "user" add constraint "user_league_name_foreign" foreign key ("league_name") references "league" ("name") on update cascade;');

    this.addSql('alter table "score" add constraint "score_map_id_foreign" foreign key ("map_id") references "map" ("id") on update cascade;');
    this.addSql('alter table "score" add constraint "score_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;');
  }

}
