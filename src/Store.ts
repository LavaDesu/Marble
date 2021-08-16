import * as fs from "fs/promises";
import type { Member } from "eris";
import type { Beatmap, Mod, ScoreRank, User as RamuneUser } from "ramune";
import { asyncForEach } from "./Utils";
import { Collection } from "./Util/Collection";
import { Marble } from "./Marble";

interface Data {
    commandGuilds: string[];
    rankEmotes: { [name in ScoreRank]: string };
    targetGuild: string;
    leagues: Record<string, League>;
}
interface League {
    players: [string, string][];
    maps: [string, Mod[]?][][];
}

export interface StoreLeague {
    name: string;
    players: Collection<number, StorePlayer>;
    weeks: Collection<number, StoreWeek>;
}
export interface StorePlayer {
    discord: Member;
    league: StoreLeague;
    osu: RamuneUser;
}
export interface StoreWeek {
    league: StoreLeague;
    maps: Collection<number, StoreMap>;
    mods: Collection<number, Mod[]>;
    number: number;
}
export interface StoreMap {
    league: StoreLeague;
    map: Beatmap;
    mods?: Mod[];
    week: StoreWeek;
}

export class Store {
    public static Instance: Store;

    private commandGuilds: string[] = [];
    private rankEmotes!: { [name in ScoreRank]: string };

    private readonly leagues: Collection<string, StoreLeague> = new Collection();
    private readonly maps: Collection<number, StoreMap> = new Collection();
    private readonly players: Collection<number, StorePlayer> = new Collection();
    private readonly discordPlayers: Collection<string, StorePlayer> = new Collection();

    constructor() {
        Store.Instance = this;
    }

    public async reload(): Promise<void> {
        const raw = await fs.readFile("./data.json", "utf8");
        const data: Data = JSON.parse(raw);
        const guild = Marble.Instance.guilds.get(data.targetGuild);
        if (!guild) throw new Error("missing guild");

        this.commandGuilds = data.commandGuilds;
        this.rankEmotes = data.rankEmotes;
        this.leagues.clear();
        this.maps.clear();
        this.players.clear();
        this.discordPlayers.clear();

        for (const leagueName in data.leagues) {
            const rawLeague = data.leagues[leagueName];

            const league: StoreLeague = {
                name: leagueName,
                players: new Collection(),
                weeks: new Collection()
            };
            this.leagues.set(leagueName, league);

            await asyncForEach(rawLeague.players, async player => {
                let discord: Member | undefined;
                if (Marble.Environment.development) {
                    console.log("[dev] discord user stub");
                    discord = guild.members.random();
                } else
                    discord = guild.members.get(player[0]);
                if (!discord) throw new Error("missing discord");

                let osu;
                try {
                    osu = await Marble.Instance.ramune.getUser(player[1]);
                } catch(e) {
                    console.error("missing user", player[1], e);
                    return;
                }
                const res: StorePlayer = { discord, league, osu };
                league.players.set(osu.id, res);
                this.players.set(osu.id, res);
                this.discordPlayers.set(discord.id, res);
            });
            await asyncForEach(rawLeague.maps, async (rawWeek, index) => {
                const number = index + 1;
                const week: StoreWeek = {
                    league,
                    maps: new Collection(),
                    mods: new Collection(),
                    number
                };
                league.weeks.set(number, week);

                await asyncForEach(rawWeek, async rawMap => {
                    this.maps.placehold(parseInt(rawMap[0]));
                    week.maps.placehold(parseInt(rawMap[0]));

                    let map;
                    try {
                        map = await Marble.Instance.ramune.lookupBeatmap({ id: rawMap[0] });
                    } catch(e) {
                        console.error("missing map", rawMap[0], e);
                        return;
                    }
                    const res: StoreMap = { league, map, week };
                    if (rawMap[1]) {
                        res.mods = rawMap[1];
                        week.mods.set(map.id, rawMap[1]);
                    }
                    this.maps.set(map.id, res);
                    week.maps.set(map.id, res);
                });
            });
        }
        console.log("Data loaded");
    }

    public getLeague(name: string) {
        return this.leagues.get(name);
    }
    public getMap(id: number) {
        return this.maps.get(id);
    }
    public getPlayer(id: number) {
        return this.players.get(id);
    }
    public getPlayerByDiscord(id: string) {
        return this.discordPlayers.get(id);
    }
    public getRankEmote(rank: ScoreRank) {
        return this.rankEmotes[rank];
    }

    public getLeagues() {
        return this.leagues;
    }
    public getMaps() {
        return this.maps;
    }
    public getPlayers() {
        return this.players;
    }
    public getCommandGuilds() {
        return this.commandGuilds;
    }
    public getRankEmotes() {
        return this.rankEmotes;
    }
}
