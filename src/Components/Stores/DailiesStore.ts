import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import type { Beatmap, Beatmapset, Mod, User as RamuneUser } from "ramune";
import { Blob } from "../../Blob";
import { Collection } from "../../Utils/Collection";
import { Component, Load, Dependency } from "../../Utils/DependencyInjection";
import { asyncForEach } from "../../Utils/Helpers";
import { Logger } from "../../Utils/Logger";
import { WrappedRamune } from "../WrappedRamune";

interface DailiesObject {
    motdChannel?: string;
    feedChannel?: string;
    epoch: number;
    players: [osuID: number, discordID?: string][];
    maps: [id: number, mods?: OperatorNode, submittedBy?: string, messageID?: string][];
}

export interface StoreEvents<T> {
    (event: "mapReset", listener: (map?: DailiesMap) => void): T;
}
export interface DailiesStore {
    on: StoreEvents<this>;
    once: StoreEvents<this>;
}

@Component("Store/Dailies")
export class DailiesStore extends EventEmitter {
    private readonly logger = new Logger("Store/Dailies");

    @Dependency private readonly ramune!: WrappedRamune;

    public epoch!: number;
    public motdChannel?: string;
    public feedChannel?: string;
    public currentMap?: DailiesMap;
    public nextMapTimer?: NodeJS.Timeout;
    protected readonly maps: Collection<number, DailiesMap> = new Collection();
    protected readonly players: Collection<number, RamuneUser> = new Collection();
    protected readonly discordPlayers: Collection<string, RamuneUser> = new Collection();
    protected readonly osuToDiscord: Collection<number, string> = new Collection();

    @Load
    public async load(): Promise<void> {
        this.maps.clear();
        this.players.clear();
        this.discordPlayers.clear();
        this.osuToDiscord.clear();

        // @ts-ignore-next-line it'll be fine
        let data: DailiesObject = undefined;
        try {
            const raw = await fs.readFile(Blob.Environment.dailiesPath, "utf8");
            data = JSON.parse(raw);
        } catch(e) {
            try {
                await fs.access(Blob.Environment.dailiesPath, fs.constants.R_OK);
                this.logger.error(e);
            } catch(_e) {
                data = {
                    epoch: new Date().setUTCHours(0, 0, 0, 0),
                    players: [],
                    maps: []
                };
                await fs.writeFile(Blob.Environment.dailiesPath, JSON.stringify(data, undefined, 4), "utf8");
            }
        }

        // @ts-ignore-next-line it'll be fine
        if (data === undefined)
            throw new Error("Error while parsing dailies.json");

        if (data.feedChannel === undefined || data.motdChannel === undefined)
            this.logger.warn("Make sure to populate channel IDs in dailies.json!");

        this.epoch = data.epoch;
        this.motdChannel = data.motdChannel;
        this.feedChannel = data.feedChannel;

        await asyncForEach(data.players, async player => {
            this.players.placehold(player[0]);
            if (player[1]) {
                this.osuToDiscord.set(player[0], player[1]);
                this.discordPlayers.placehold(player[1]);
            }

            let osu;
            try {
                osu = await this.ramune.getUser(player[0]);
            } catch(e) {
                this.logger.error("missing user", player[0], e);
                return;
            }
            this.players.set(osu.id, osu);
            if (player[1])
                this.discordPlayers.set(player[1], osu);
        });
        data.maps.forEach(map => this.maps.placehold(map[0]));
        await asyncForEach(data.maps, async (rawMap, index) => {
            await this.addMap(rawMap[0], rawMap[1], rawMap[2], rawMap[3], index);
        });
        this.resetCurrentMap();
    }

    public async addMap(id: number, mods?: OperatorNode, submitter?: string, messageID?: string, index?: number): Promise<DailiesMap | undefined> {
        const uIndex = index ?? this.maps.size;
        let map;
        let beatmapset;
        try {
            map = await this.ramune.getBeatmap(id);
            beatmapset = await map.beatmapset!.eval();
            // XXX: Ramune bug; beatmap(set) isn't populated by default
            (map as any).populate(map!.raw);
            (beatmapset as any).populate(beatmapset!.raw);
        } catch(e) {
            this.logger.error("missing map", id, e);
            return;
        }
        if (!beatmapset) {
            this.logger.error("missing beatmapset", id);
            return;
        }

        const res: DailiesMap = {
            map,
            beatmapset,
            requester: submitter,
            index: uIndex,
            timeRange: [this.epoch + uIndex * 8.64e7, this.epoch + (uIndex + 1) * 8.64e7],
            messageID
        };
        if (mods)
            res.mods = mods;

        this.maps.set(map.id, res);

        return res;
    }

    public recalcEpoch() {
        this.maps.forEach((map, index) => {
            map.timeRange = [this.epoch + index * 8.64e7, this.epoch + (index + 1) * 8.64e7];
        });
        this.resetCurrentMap();
    }

    public resetCurrentMap() {
        this.currentMap = undefined;
        if (this.nextMapTimer)
            clearTimeout(this.nextMapTimer);
        this.nextMapTimer = undefined;

        this.maps.forEach(map => {
            const date = Date.now();
            if (map.timeRange[0] < date && date <= map.timeRange[1]) {
                this.currentMap = map;
                this.nextMapTimer = setTimeout(this.resetCurrentMap.bind(this), map.timeRange[1] - date);
            }
        });
        this.sync();

        this.emit("mapReset", this.currentMap);
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

    public getDiscordFromOsu(id: number) {
        return this.osuToDiscord.get(id);
    }

    public getMaps() {
        return this.maps;
    }
    public getPlayers() {
        return this.players;
    }
    public getPlayersByDiscord() {
        return this.discordPlayers;
    }

    public async sync() {
        const maps = this.maps.valuesAsArray().map(m => {
            const res: DailiesObject["maps"][0] = [m.map.id];
            if (m.mods)
                res[1] = m.mods;
            if (m.requester)
                res[2] = m.requester;
            if (m.messageID)
                res[3] = m.messageID;

            return res;
        });
        const players = this.players.valuesAsArray().map(m => {
            const ret: DailiesObject["players"][0] = [m.id];
            const did = this.getDiscordFromOsu(m.id);
            if (did)
                ret[1] = did;

            return ret;
        });
        await fs.writeFile(Blob.Environment.dailiesPath, JSON.stringify({
            motdChannel: this.motdChannel,
            feedChannel: this.feedChannel,
            epoch: this.epoch,
            maps,
            players
        }, undefined, 4));
    }
}

export interface DailiesMap {
    map: Beatmap;
    beatmapset: Beatmapset;
    index: number;
    mods?: OperatorNode;
    requester?: string;
    timeRange: [from: number, to: number];

    messageID?: string;
}

export interface OperatorOR {
    OR: OperatorNode[];
}
export type OperatorNode = OperatorOR | Mod | Mod[];
