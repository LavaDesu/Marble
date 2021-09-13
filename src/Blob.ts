import "reflect-metadata";

import { Ramune } from "ramune";
import { GatewayServer, MessageOptions, SlashCreator } from "slash-create";

import { DevCommand } from "./Commands/Dev";
import { LeaderboardsCommand } from "./Commands/Leaderboards";
import { MapCommand } from "./Commands/Map";
import { PingCommand } from "./Commands/Ping";
import { DiscordClient } from "./Components/Discord";
import { Store } from "./Components/Store";
import { LeagueTracker } from "./Components/LeagueTracker";
import { InviteTracker } from "./Components/InviteTracker";
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
    private readonly slashLogger = new Logger("SlashCreator");

    @Export private readonly discordClient: DiscordClient;
    @Export private readonly inviteTracker: InviteTracker;
    @Export private readonly store: Store;
    @Export private readonly tracker: LeagueTracker;

    @Export private readonly devCommand: DevCommand;
    @Export private readonly lbCommand: LeaderboardsCommand;
    @Export private readonly mapCommand: MapCommand;
    @Export private readonly pingCommand: PingCommand;

    @Export private readonly slashInstance: SlashCreator;

    @Export
    @NeedsLoad
    private readonly ramune: Ramune;

    constructor() {
        this.logger.info(`Blob ${VERSION as string}`);
        this.discordClient = new DiscordClient();

        this.inviteTracker = new InviteTracker();
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
        this.slashInstance = new SlashCreator({
            applicationID: env.botID,
            publicKey: env.botKey,
            token: env.botToken
        });

        this.devCommand = new DevCommand();
        this.lbCommand = new LeaderboardsCommand();
        this.mapCommand = new MapCommand();
        this.pingCommand = new PingCommand();

        this.ramune.refreshToken().then(() => this.markReady(Ramune));

        this.slashInstance
            .withServer(new GatewayServer(handler => {
                this.discordClient.on("rawWS", event => {
                    if (event.t === "INTERACTION_CREATE")
                        handler(event.d as any);
                });
            }))
            .on("commandBlock", (cmd, _, reason, data) => {
                this.slashLogger.error("Command blocked", cmd.commandName, reason, data);
            })
            .on("commandError", (cmd, err, ctx) => {
                this.slashLogger.error("Command errored", cmd.commandName, err);

                const response: MessageOptions = {
                    content: "An error occured :(",
                    embeds: [],
                    components: []
                };
                if (ctx.messageID)
                    ctx.editOriginal(response);
                else
                    ctx.send(response);
            })
            .on("error", (e) => {
                this.slashLogger.error("Unknown slash error", e);
            });
    }

    load() {
        this.slashInstance.syncCommands().once("synced", () => {
            this.discordClient.editStatus("online");
            this.logger.info("Ready~");
        });
    }

    async unload() {
        this.slashInstance.syncCommands();
        await new Promise<void>(r => this.slashInstance.once("synced", r));
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

        await provider.unload();
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
