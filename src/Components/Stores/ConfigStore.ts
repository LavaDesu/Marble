import * as fs from "fs/promises";
import type { ScoreRank } from "ramune";
import { Blob } from "../../Blob";
import { Component, Load } from "../../Utils/DependencyInjection";
import { Logger } from "../../Utils/Logger";
import type { LeagueConfig } from "./LeagueStore";

export type Config = MainConfig & LeagueConfig;

interface MainConfig {
    commandGuilds: string[];
    inviteTracking: InviteTrackingSettings;
    rankEmotes: { [name in ScoreRank]: string };
}
interface InviteTrackingSettings {
    guilds: Record<string, string>;
}

@Component("Store/Config")
export class ConfigStore {
    private readonly logger = new Logger("Store/Config");

    private config!: Config;
    private commandGuilds: string[] = [];
    private inviteTracking: InviteTrackingSettings = { guilds: {} };
    private rankEmotes!: { [name in ScoreRank]: string };

    @Load
    public async load(): Promise<void> {
        const raw = await fs.readFile(Blob.Environment.configPath, "utf8");
        const config: Config = JSON.parse(raw);
        this.config = config;

        this.commandGuilds = config.commandGuilds;
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
    public getInviteTrackingSettings() {
        return this.inviteTracking;
    }
    public getRankEmotes() {
        return this.rankEmotes;
    }
}
