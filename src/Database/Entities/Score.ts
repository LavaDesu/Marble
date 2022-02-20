import { Entity, Enum, Filter, Index, ManyToOne, PrimaryKey, Property, t } from "@mikro-orm/core";
import { Mod, ScoreRank } from "ramune";
import type { Score as RamuneScore } from "ramune/lib/Responses";
import { CustomBaseEntity } from "./CustomBaseEntity";
import { Map } from "./Map";
import { User } from "./User";

@Entity()
@Index({ properties: ["map", "user"] })
export class Score extends CustomBaseEntity<Score, "id"> {
    @PrimaryKey({ type: t.bigint }) id!: string;
    @Property({ type: t.bigint }) bestID?: string;
    @Property({ columnType: "timestamptz(3)" }) createdAt!: Date;
    @Enum({ array: true, items: () => Mod }) mods!: Mod[];

    @Enum(() => ScoreRank) rank!: ScoreRank;
    @Property({ type: t.float }) accuracy!: number;
    @Property({ type: t.smallint }) combo!: number;
    @Property({ type: t.integer }) score!: number;
    @Property({ type: t.smallint }) count300!: number;
    @Property({ type: t.smallint }) count100!: number;
    @Property({ type: t.smallint }) count50!: number;
    @Property({ type: t.smallint }) countmiss!: number;

    @ManyToOne() map!: Map;
    @ManyToOne() user!: User;

    constructor(data: RamuneScore) {
        super();

        this.id = data.id.toString();
        this.bestID = data.best_id.toString();
        this.createdAt = new Date(data.created_at);
        this.mods = data.mods;

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
