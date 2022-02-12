import { Entity, Enum, Index, JsonType, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import type { Mod, ScoreRank } from "ramune";
import type { Score as RamuneScore } from "ramune/lib/Responses";
import { CustomBaseEntity } from "./CustomBaseEntity";
import { Map } from "./Map";
import { User } from "./User";

@Entity()
@Index({ properties: ["map", "user"] })
export class Score extends CustomBaseEntity<Score, "id"> {
    @PrimaryKey() id!: number;
    @Property() bestID?: number;
    @Property() createdAt!: Date;
    @Enum({ array: true }) mods!: Mod[];

    @Property({ type: JsonType, lazy: true })
    raw!: RamuneScore;

    @Property() accuracy!: number;
    @Property() combo!: number;
    @Enum() rank!: ScoreRank;
    @Property() score!: number;
    @Property() count300!: number;
    @Property() count100!: number;
    @Property() count50!: number;
    @Property() countmiss!: number;

    @ManyToOne() map!: Map;
    @ManyToOne() user!: User;

    constructor(data: RamuneScore) {
        super();

        this.id = data.id;
        this.bestID = data.best_id;
        this.createdAt = new Date(data.created_at);
        this.mods = data.mods;

        this.raw = data;

        this.accuracy = data.accuracy;
        this.combo = data.max_combo;
        this.rank = data.rank;
        this.score = data.score;
        this.count300 = data.statistics.count_300;
        this.count100 = data.statistics.count_100;
        this.count50 = data.statistics.count_50;
        this.countmiss = data.statistics.count_miss;
    }

    public testMods(): boolean {
        return this.map.testMods(this);
    }
}
