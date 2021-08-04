import * as fs from "fs/promises";
import { Client, ClientOptions } from "eris";
import { Ramune, UserClient } from "ramune";
import { CommandContext, GatewayServer, MessageOptions, SlashCreator } from "slash-create";

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
    public ramuneClient!: UserClient;
    private refreshToken!: string;

    private readonly slashInstance = new SlashCreator({
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

            this.slashInstance.registerCommands([
                new Ping(this.slashInstance),
                new Dev(this.slashInstance),
                new Leaderboards(this.slashInstance),
                new MapCommand(this.slashInstance)
            ]).syncCommands();
        });

        this.ramune = await Ramune.create(env.osuID, env.osuSecret);
        this.refreshToken = (await fs.readFile("./.refresh", "utf8")).trim();
        this.ramuneClient = await this.ramune.createUserClient(this.refreshToken, "refresh");
        this.ramuneClient.on("tokenUpdate", async token =>
            await fs.writeFile("./.refresh", token.refresh_token!, "utf8")
        );
        this.connect();
    }
}

new Marble(env.botToken);
Marble.Instance.init();

[ "SIGINT", "SIGTERM" ].map(signal =>
    process.on(signal, async () => {
        console.log("Exiting via", signal);
        Marble.Instance.editStatus("offline");
        await Marble.Instance.componentQueue.clear();
        // HACK: grace period for status edit to work
        await new Promise(r => setTimeout(r, 1e3));

        Marble.Instance.once("disconnect", () => {
            console.log("Disconnected. Goodbye!");
            process.exit();
        });
        Marble.Instance.disconnect({ reconnect: false });

        await new Promise(r => setTimeout(r, 5e3));
        console.log("Forced exit after timeout (5 seconds)");
        process.exit();
    })
);
