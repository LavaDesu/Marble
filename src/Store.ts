import * as fs from "fs/promises";
import type { Guild, Member } from "eris";
import type { User as RamuneUser } from "ramune/lib/Responses/User";
import type { Beatmap } from "ramune/lib/Responses/Beatmap";
import type { Mod } from "ramune/lib/Enums";
import { asyncForEach } from "./Utils";
import { Collection } from "./Util/Collection";
import { Marble } from "./Marble";

interface LeagueData {
    commandGuilds: string[];
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

    private readonly leagues: Collection<string, StoreLeague> = new Collection();
    private readonly maps: Collection<number, StoreMap> = new Collection();
    private readonly players: Collection<number, StorePlayer> = new Collection();
    private readonly discordPlayers: Collection<string, StorePlayer> = new Collection();
    // private readonly weeks: Collection<number, StoreWeek> = new Collection();

    constructor() {
        Store.Instance = this;
    }

    public async reload(): Promise<void> {
        const raw = await fs.readFile("./data.json", "utf8");
        const leagueData: LeagueData = JSON.parse(raw);
        const guild = Marble.Instance.guilds.get(leagueData.targetGuild);
        if (!guild) throw new Error("missing guild");

        this.commandGuilds = leagueData.commandGuilds;
        this.leagues.clear();
        this.maps.clear();
        this.players.clear();
        this.discordPlayers.clear();
        // this.weeks.clear();

        for (const leagueName in leagueData.leagues) {
            const rawLeague = leagueData.leagues[leagueName];

            const league: StoreLeague = {
                name: leagueName,
                players: new Collection(),
                weeks: new Collection()
            };
            this.leagues.set(leagueName.toLowerCase(), league);

            await asyncForEach(rawLeague.players, async player => {
                const discord = guild.members.get(player[0]);
                const osu = await Marble.Instance.ramune.getUser(player[1]);
                if (!discord) throw new Error("missing discord");
                if (!osu) throw new Error("missing osu");
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
                    const map = await Marble.Instance.ramune.lookupBeatmap({ id: rawMap[0] });
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
        return this.leagues.get(name.toLowerCase());
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
    // public getWeek(number: number) {
    //     return this.weeks.get(number);
    // }

    public getLeagues() {
        return this.leagues;
    }
    public getMaps() {
        return this.maps;
    }
    public getPlayers() {
        return this.players;
    }
    // public getWeeks() {
    //     return this.weeks;
    // }
    public getCommandGuilds() {
        return this.commandGuilds;
    }
}
