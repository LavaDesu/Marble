import { Collection, Entity, ManyToOne, OneToMany, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { UserCompact } from "ramune/lib/Responses";
import { NumberBigIntType } from "../NumberBigIntType";
import { CustomBaseEntity } from "./CustomBaseEntity";
import { League } from "./League";
import { Score } from "./Score";

@Entity()
export class User extends CustomBaseEntity<User, "id"> {
    @PrimaryKey() id!: number;
    @Property() @Unique() discordID!: string;
    @Property() @Unique() username!: string;
    @Property({ type: NumberBigIntType }) lastPlayID = 0;
    @ManyToOne() league!: League;

    @OneToMany(() => Score, score => score.user)
    scores = new Collection<Score>(this);

    constructor(user: UserCompact, discordID: string) {
        super();

        this.reinit(user, discordID);
    }

    public reinit(user: UserCompact, discordID: string) {
        this.deleted = undefined;
        this.id = user.id;
        this.discordID = discordID;
        this.username = user.username;
    }
}
