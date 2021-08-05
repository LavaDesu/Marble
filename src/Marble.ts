import { Client, ClientOptions } from "eris";
import { Ramune } from "ramune";
import { CommandContext, GatewayServer, MessageOptions, SlashCommand, SlashCreator } from "slash-create";

import { Dev } from "./Commands/Dev";
import { Leaderboards } from "./Commands/Leaderboards";
import { MapCommand } from "./Commands/Map";
import { Ping } from "./Commands/Ping";
import { Queue } from "./Util/Queue";
import { Store } from "./Store";
import { Tracker } from "./Tracker";

const env = {
    development: process.env.NODE_ENV === "development",
    botID: process.env.MARBLE_BOT ?? "",
    botKey: process.env.MARBLE_KEY ?? "",
    botToken: process.env.MARBLE_TOKEN ?? "",
    osuID: process.env.MARBLE_ID ?? "",
    osuSecret: process.env.MARBLE_SECRET ?? "",
    webhookID: process.env.MARBLE_WEBHOOK_ID ?? "",
    webhookToken: process.env.MARBLE_WEBHOOK_TOKEN ?? ""
};


export class Marble extends Client {
    public static Instance: Marble;
    public static readonly Environment = env;

    public readonly componentQueue: Queue<CommandContext>;
    public readonly store: Store;
    public readonly tracker: Tracker;
    public ramune!: Ramune;

    public readonly commands: SlashCommand[] = [];

    public readonly slashInstance = new SlashCreator({
        applicationID: env.botID,
        publicKey: env.botKey,
        token: env.botToken
    });

    constructor(token: string, settings: ClientOptions = {}) {
        super(token, {
            maxShards: "auto",
            defaultImageFormat: "png",
            defaultImageSize: 2048,
            getAllUsers: true,
            ...settings
        });
        Marble.Instance = this;
        this.componentQueue = new Queue(ctx => {
            if (ctx.messageID) try {
                // Using allowedMention here to clear the components safely, as in
                // without affecting the message content
                ctx.editOriginal({ allowedMentions: { everyone: false }, components: [] });
            } catch(e) {}
        }, 600e3);
        this.store = new Store();
        this.tracker = new Tracker();
    }

    public async init(): Promise<void> {
        this.slashInstance
            .withServer(new GatewayServer(handler => {
                this.on("rawWS", event => {
                    if (event.t === "INTERACTION_CREATE")
                        handler(event.d as any);
                });
            }))
            .syncCommands()
            .on("commandBlock", (cmd, _, reason, data) => {
                console.error("Command blocked", cmd.commandName, reason, data);
            })
            .on("commandError", (cmd, err, ctx) => {
                console.error("Command errored", cmd.commandName, err);

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
                console.error("Unknown slash error", e);
            });

        this.on("ready", () => {
            console.log((new Date()).toISOString(), `Connected as ${this.user.username}#${this.user.discriminator} (${this.user.id})`);
            this.editStatus("online");
        });

        this.once("ready", async () => {
            await this.store.reload();
            await this.tracker.init();

            this.commands.push(
                new Ping(this.slashInstance),
                new Dev(this.slashInstance),
                new Leaderboards(this.slashInstance),
                new MapCommand(this.slashInstance)
            );

            this.slashInstance.registerCommands(this.commands).syncCommands();
        });

        this.ramune = await Ramune.create(env.osuID, env.osuSecret, {
            requestHandler: {
                rateLimit: {
                    limit: 500,
                    interval: 60e3
                }
            }
        });
        this.connect();
    }
}

new Marble(env.botToken);
Marble.Instance.init();

[ "SIGINT", "SIGTERM" ].map(signal =>
    process.on(signal, async () => {
        console.log("Exiting via", signal);

        const marble = Marble.Instance;
        marble.editStatus("offline");
        marble.commands.forEach(cmd => marble.slashInstance.unregisterCommand(cmd));
        await marble.componentQueue.clear();
        // HACK: grace period for status edit to work
        await new Promise(r => setTimeout(r, 1e3));

        marble.once("disconnect", () => {
            console.log("Disconnected. Goodbye!");
            process.exit();
        });
        marble.disconnect({ reconnect: false });

        await new Promise(r => setTimeout(r, 5e3));
        console.log("Forced exit after timeout (5 seconds)");
        process.exit();
    })
);
