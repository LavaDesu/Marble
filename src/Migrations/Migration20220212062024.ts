import { Migration } from "@mikro-orm/migrations";

export class Migration20220212062024 extends Migration {

    async up(): Promise<void> {
        this.addSql("create table `league` (`name` text not null, `deleted` datetime null, primary key (`name`));");
        this.addSql("create index `league_deleted_index` on `league` (`deleted`);");

        this.addSql("create table `map` (`id` integer not null primary key autoincrement, `deleted` datetime null, `mod_expression` text null, `set_id` integer not null, `week` integer not null, `artist` text not null, `diff` text not null, `scoreable` integer not null, `title` text not null, `max_combo` integer not null, `league_name` text not null, constraint `map_league_name_foreign` foreign key(`league_name`) references `league`(`name`) on update cascade);");
        this.addSql("create index `map_deleted_index` on `map` (`deleted`);");
        this.addSql("create index `map_league_name_index` on `map` (`league_name`);");

        this.addSql("create table `user` (`id` integer not null primary key autoincrement, `deleted` datetime null, `discord_id` text not null, `username` text not null, `last_play_id` integer not null, `league_name` text not null, constraint `user_league_name_foreign` foreign key(`league_name`) references `league`(`name`) on update cascade);");
        this.addSql("create index `user_deleted_index` on `user` (`deleted`);");
        this.addSql("create unique index `user_discord_id_unique` on `user` (`discord_id`);");
        this.addSql("create unique index `user_username_unique` on `user` (`username`);");
        this.addSql("create index `user_league_name_index` on `user` (`league_name`);");

        this.addSql("create table `score` (`id` integer not null primary key autoincrement, `deleted` datetime null, `best_id` integer null, `created_at` datetime not null, `mods` text not null, `raw` json not null, `accuracy` integer not null, `combo` integer not null, `rank` integer not null, `score` integer not null, `count300` integer not null, `count100` integer not null, `count50` integer not null, `countmiss` integer not null, `map_id` integer not null, `user_id` integer not null, constraint `score_map_id_foreign` foreign key(`map_id`) references `map`(`id`) on update cascade, constraint `score_user_id_foreign` foreign key(`user_id`) references `user`(`id`) on update cascade);");
        this.addSql("create index `score_deleted_index` on `score` (`deleted`);");
        this.addSql("create index `score_map_id_index` on `score` (`map_id`);");
        this.addSql("create index `score_user_id_index` on `score` (`user_id`);");
        this.addSql("create index `score_map_id_user_id_index` on `score` (`map_id`, `user_id`);");
    }

}
