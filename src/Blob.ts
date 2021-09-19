import "reflect-metadata";

import { Ramune } from "ramune";

import { DiscordClient } from "./Components/Discord";
import { Store } from "./Components/Store";
import { LeagueTracker } from "./Components/LeagueTracker";
import { InviteTracker } from "./Components/InviteTracker";
import { SlashHandler } from "./Components/SlashHandler";
import { Export, NeedsLoad, Provider } from "./Utils/DependencyInjection";
import { Logger } from "./Utils/Logger";

import { version as VERSION } from "../package.json";

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
    webhookToken: process.env.BLOB_WEBHOOK_TOKEN ?? ""
} as const;

export interface Blob extends Provider {}
@Provider
export class Blob {
    public static readonly Environment = env;

    public readonly logger = new Logger("Blob");

    @Export private readonly discordClient: DiscordClient;
    @Export private readonly inviteTracker: InviteTracker;
    @Export private readonly store: Store;
    @Export private readonly tracker: LeagueTracker;

    @Export private readonly slashHandler: SlashHandler;

    @Export
    @NeedsLoad
    private readonly ramune: Ramune;

    constructor() {
        this.logger.info(`Blob ${VERSION as string}`);
        this.discordClient = new DiscordClient();

        this.inviteTracker = new InviteTracker();
        this.slashHandler = new SlashHandler();
        this.store = new Store();
        this.tracker = new LeagueTracker();
        this.ramune = new Ramune(env.osuID, env.osuSecret, {
            requestHandler: {
                rateLimit: {
                    limit: 500,
                    interval: 60e3
                }
            }
        });

        this.ramune.refreshToken().then(() => this.markReady(Ramune));
    }

    load() {
        this.discordClient.editStatus("online");
        this.logger.info("Ready~");
    }
}

const provider = new Blob();

[ "SIGINT", "SIGTERM" ].map(signal =>
    process.on(signal, async () => {
        provider.logger.info("Exiting via", signal);

        setTimeout(() => {
            provider.logger.warn("Forced exit after timeout (10 seconds)");
            process.exit();
        }, 10e3);

        await provider.unload?.();
        const uptime = process.uptime();
        const uptimeString = [
            Math.floor(uptime / 60 / 60 / 24),
            Math.floor(uptime % (60 * 60 * 24) / 60 / 60),
            Math.floor(uptime % (60 * 60) / 60),
            Math.floor(uptime % 60)
        ].map(t => t.toString().padStart(2, "0")).join(":");
        provider.logger.info("Goodbye!");
        provider.logger.info("Uptime: " + uptimeString);
        process.exit();
    })
);
