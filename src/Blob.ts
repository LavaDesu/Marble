import "reflect-metadata";

import { Ramune } from "ramune";

import { DiscordClient } from "./Components/Discord";
import { LeagueTracker } from "./Components/LeagueTracker";
import { InviteTracker } from "./Components/InviteTracker";
import { SlashHandler } from "./Components/SlashHandler";
import { Export, NeedsLoad, Provider } from "./Utils/DependencyInjection";
import { Logger } from "./Utils/Logger";

import { version as VERSION } from "../package.json";
import { Database } from "./Components/Database";
import { Config } from "./Config";

export interface Blob extends Provider {}
@Provider
export class Blob {
    public readonly logger = new Logger("Blob");

    @Export private readonly database: Database;
    @Export private readonly discordClient: DiscordClient;
    @Export private readonly inviteTracker: InviteTracker;
    @Export private readonly tracker: LeagueTracker;

    @Export private readonly slashHandler: SlashHandler;

    @Export
    @NeedsLoad
    private readonly ramune: Ramune;

    constructor() {
        this.logger.info(`Blob ${VERSION as string}`);
        this.discordClient = new DiscordClient();

        this.database = new Database();
        this.inviteTracker = new InviteTracker();
        this.slashHandler = new SlashHandler();
        this.tracker = new LeagueTracker();
        this.ramune = new Ramune(Config.osuID.toString(), Config.osuSecret, {
            requestHandler: {
                rateLimit: {
                    limit: 5,
                    interval: 1
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
