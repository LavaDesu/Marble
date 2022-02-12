import { Collection, Entity, OneToMany, PrimaryKey } from "@mikro-orm/core";
import { CustomBaseEntity } from "./CustomBaseEntity";
import { Map } from "./Map";
import { User } from "./User";

@Entity()
export class League extends CustomBaseEntity<League, "name"> {
    @PrimaryKey() name!: string;

    @OneToMany(() => Map, map => map.league)
    maps = new Collection<Map>(this);

    @OneToMany(() => User, user => user.league)
    players = new Collection<User>(this);

    constructor(name: string) {
        super();
        this.name = name;
    }
}
