import * as fs from "fs/promises";
import type { ScoreRank } from "ramune";
import { Component, ComponentLoad } from "../../Utils/DependencyInjection";
import { Logger } from "../../Utils/Logger";

export interface Config {
    commandGuilds: string[];
    fdl: FdlSettings;
    inviteTracking: InviteTrackingSettings;
    rankEmotes: { [name in ScoreRank]: string };
}
interface FdlSettings {
    admins: string[];
    guild: string;
}
interface InviteTrackingSettings {
    guilds: Record<string, string>;
}

@Component("Store/Config")
export class ConfigStore implements Component {
    private readonly logger = new Logger("Store/Config");

    private config!: Config;
    private commandGuilds: string[] = [];
    private fdl: FdlSettings = { admins: [], guild: "" };
    private inviteTracking: InviteTrackingSettings = { guilds: {} };
    private rankEmotes!: { [name in ScoreRank]: string };

    @ComponentLoad
    public async load(): Promise<void> {
        const raw = await fs.readFile("./data.json", "utf8");
        const config: Config = JSON.parse(raw);
        this.config = config;

        this.commandGuilds = config.commandGuilds;
        this.fdl = config.fdl;
        this.inviteTracking = config.inviteTracking;
        this.rankEmotes = config.rankEmotes;
    }

    public getConfig() {
        return this.config;
    }

    public getRankEmote(rank: ScoreRank) {
        return this.rankEmotes[rank];
    }

    public getCommandGuilds() {
        return this.commandGuilds;
    }
    public getFdlSettings() {
        return this.fdl;
    }
    public getInviteTrackingSettings() {
        return this.inviteTracking;
    }
    public getRankEmotes() {
        return this.rankEmotes;
    }
}
