import "reflect-metadata";

import { DiscordClient } from "./Components/Discord";
import { DailiesTracker } from "./Components/DailiesTracker";
import { InviteTracker } from "./Components/InviteTracker";
import { Logger } from "./Utils/Logger";

import { version as VERSION } from "../package.json";
import { Component, Container, Dependency, Load } from "./Utils/DependencyInjection";
import { DailiesCommand } from "./Commands/Dailies";
import { DevCommand } from "./Commands/Dev";
import { PingCommand } from "./Commands/Ping";
import { SnipeCommand } from "./Commands/Snipe";

export const env = {
    development: process.env.NODE_ENV === "development",
    devGuild: process.env.BLOB_DEV_GUILD ?? "",
    devID: process.env.BLOB_DEV ?? "",
    botID: process.env.BLOB_BOT ?? "",
    botKey: process.env.BLOB_KEY ?? "",
    botToken: process.env.BLOB_TOKEN ?? "",
    osuID: process.env.BLOB_ID ?? "",
    osuSecret: process.env.BLOB_SECRET ?? "",
    webhookID: process.env.BLOB_WEBHOOK_ID ?? "",
    webhookToken: process.env.BLOB_WEBHOOK_TOKEN ?? "",

    configPath: process.env.BLOB_CONFIG_PATH ?? "./data.json",
    dailiesPath: process.env.BLOB_DAILIES_PATH ?? "./dailies.json",
    scorePath: process.env.BLOB_SCORE_PATH ?? "./scores"
} as const;

const container = Container.scope(Symbol("DI/Main"), { strict: true });

@Component()
export class Blob {
    public static readonly Environment = env;
    public readonly logger = new Logger("Blob");

    @Dependency private readonly inviteTracker!: InviteTracker;
    @Dependency private readonly dailiesTracker!: DailiesTracker;

    @Dependency private readonly dailiesCommand!: DailiesCommand;
    @Dependency private readonly devCommand!: DevCommand;
    @Dependency private readonly pingCommand!: PingCommand;
    @Dependency private readonly snipeCommand!: SnipeCommand;

    constructor() {
        this.logger.info(`Blob ${VERSION as string}`);
    }

    @Load
    async load() {
        const discord = await container.get(DiscordClient);
        discord.editStatus("online");
        this.logger.info("Ready~");
    }
}

const instance = container.getNoWait(Blob);

[ "SIGINT", "SIGTERM" ].map(signal =>
    process.on(signal, async () => {
        instance.logger.info("Exiting via", signal);

        setTimeout(() => {
            instance.logger.warn("Forced exit after timeout (10 seconds)");
            process.exit();
        }, 10e3);

        await container.unload(Blob);
        const uptime = process.uptime();
        const uptimeString = [
            Math.floor(uptime / 60 / 60 / 24),
            Math.floor(uptime % (60 * 60 * 24) / 60 / 60),
            Math.floor(uptime % (60 * 60) / 60),
            Math.floor(uptime % 60)
        ].map(t => t.toString().padStart(2, "0")).join(":");
        instance.logger.info("Goodbye!");
        instance.logger.info("Uptime: " + uptimeString);
        process.exit();
    })
);
