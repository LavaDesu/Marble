import { Collection, Entity, ManyToOne, OneToMany, PrimaryKey, Property } from "@mikro-orm/core";
import { compileExpression } from "filtrex";
import { Mod } from "ramune";
import { BeatmapExtended, BeatmapsetExtended } from "ramune/lib/Responses";
import { CustomBaseEntity } from "./CustomBaseEntity";
import { League } from "./League";
import { Score } from "./Score";

@Entity()
export class Map extends CustomBaseEntity<Map, "id"> {
    @PrimaryKey() id!: number;

    @Property() modExpression?: string;
    @Property() setID!: number;
    @Property() week!: number;

    @Property() artist!: string;
    @Property() diff!: string;
    @Property() scoreable!: boolean;
    @Property() title!: string;
    @Property() maxCombo!: number;

    @OneToMany(() => Score, score => score.map)
    scores = new Collection<Score>(this);

    @ManyToOne() league!: League;

    constructor(data: BeatmapExtended, dataSet: BeatmapsetExtended) {
        super();

        this.reinit(data, dataSet);
    }

    public reinit(data: BeatmapExtended, dataSet: BeatmapsetExtended) {
        this.deleted = undefined;
        this.id = data.id;
        this.setID = data.beatmapset_id;

        this.artist = dataSet.artist;
        this.diff = data.version;
        this.scoreable = dataSet.is_scoreable;
        this.title = dataSet.title;
        this.maxCombo = data.max_combo!;
    }

    private modExprCache?: (args: { mods: Mod[] }) => boolean;
    public testMods(score: Score): boolean {
        if (!this.modExpression)
            return true;
        if (!this.modExprCache)
            this.modExprCache = compileExpression(this.modExpression);

        return this.modExprCache({ mods: score.mods });
    }
}
