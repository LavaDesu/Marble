import type { Beatmap, Beatmapset, Mod, User as RamuneUser } from "ramune";
import { Ramune } from "ramune";
import { Collection } from "../../Utils/Collection";
import { Component, ComponentLoad, Dependency } from "../../Utils/DependencyInjection";
import { asyncForEach } from "../../Utils/Helpers";
import { Logger } from "../../Utils/Logger";
import { ConfigStore } from "./ConfigStore";

export interface LeagueConfig {
    leagues: Record<string, LeagueObject>;
}
interface LeagueObject {
    players: [string, string][];
    maps: [string, OperatorNode?][][];
}

@Component("Store/League")
export class LeagueStore {
    private readonly logger = new Logger("Store/League");

    @Dependency private readonly config!: ConfigStore;
    @Dependency private readonly ramune!: Ramune;

    private readonly leagues: Collection<string, League> = new Collection();
    private readonly maps: Collection<number, LeagueMap> = new Collection();
    private readonly players: Collection<number, LeaguePlayer> = new Collection();
    private readonly discordPlayers: Collection<string, LeaguePlayer> = new Collection();

    @ComponentLoad
    public async load(): Promise<void> {
        this.leagues.clear();
        this.maps.clear();
        this.players.clear();
        this.discordPlayers.clear();

        const data = this.config.getConfig();
        for (const leagueName in data.leagues) {
            const rawLeague = data.leagues[leagueName];

            const league: League = {
                name: leagueName,
                players: new Collection(),
                weeks: new Collection()
            };
            this.leagues.set(leagueName, league);

            await asyncForEach(rawLeague.players, async player => {
                let osu;
                try {
                    osu = await this.ramune.getUser(player[1]);
                } catch(e) {
                    this.logger.error("missing user", player[1], e);
                    return;
                }
                const res: LeaguePlayer = { league, osu };
                league.players.set(osu.id, res);
                this.players.set(osu.id, res);
                this.discordPlayers.set(player[0], res);
            });
            await asyncForEach(rawLeague.maps, async (rawWeek, index) => {
                const number = index + 1;
                const week: LeagueWeek = {
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
                    let beatmapset;
                    try {
                        map = await this.ramune.getBeatmap(rawMap[0]);
                        beatmapset = await map.beatmapset!.eval();
                        // XXX: Ramune bug; beatmap(set) isn't populated by default
                        (map as any).populate(map!.raw);
                        (beatmapset as any).populate(beatmapset!.raw);
                    } catch(e) {
                        this.logger.error("missing map", rawMap[0], e);
                        return;
                    }
                    if (!beatmapset) {
                        this.logger.error("missing beatmapset", rawMap[0]);
                        return;
                    }

                    const res: LeagueMap = { league, map, beatmapset, week };
                    if (rawMap[1]) {
                        res.mods = rawMap[1];
                        week.mods.set(map.id, rawMap[1]);
                    }
                    this.maps.set(map.id, res);
                    week.maps.set(map.id, res);
                });
            });
        }
    }

    public getFriendlyMods(mapID: number): string {
        const map = this.maps.get(mapID);

        if (!map) {
            this.logger.error("missing map!", mapID);
            return "";
        }

        const node = map.mods;
        if (!node)
            return "Freemod :)";

        return this.formatOperator(node);
    }

    private formatOperator(node: OperatorNode): string {
        if (Array.isArray(node))
            if (node.length === 0)
                return "NM";
            else
                return node.join("");

        if (typeof node === "string")
            return node + " + Freemod";

        if (node.OR)
            return "Either " +
                node.OR.map(v => this.formatOperator(v)).join(" or ");

        return "";
    }

    public testMods(mapID: number, mods: Mod[]): boolean {
        const map = this.maps.get(mapID);

        if (!map)
            return false;

        const node = map.mods;
        if (!node)
            return true;

        return this.testOperator(node, mods);
    }

    private testOperator(node: OperatorNode, input: Mod[]): boolean {
        if (Array.isArray(node))
            return [...input].sort().toString() === [...node].sort().toString();

        if (typeof node === "string")
            if (node === "DT" && input.includes("NC"))
                return true;
            else
                return input.includes(node);

        if (node.OR)
            return node.OR.some(v => this.testOperator(v, input));

        return false;
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

    public getLeagues() {
        return this.leagues;
    }
    public getMaps() {
        return this.maps;
    }
    public getPlayers() {
        return this.players;
    }
}

export interface League {
    name: string;
    players: Collection<number, LeaguePlayer>;
    weeks: Collection<number, LeagueWeek>;
}
export interface LeaguePlayer {
    league: League;
    osu: RamuneUser;
}
export interface LeagueWeek {
    league: League;
    maps: Collection<number, LeagueMap>;
    mods: Collection<number, OperatorNode>;
    number: number;
}
export interface LeagueMap {
    league: League;
    map: Beatmap;
    beatmapset: Beatmapset;
    mods?: OperatorNode;
    week: LeagueWeek;
}

export interface OperatorOR {
    OR: OperatorNode[];
}
export type OperatorNode = OperatorOR | Mod | Mod[];

