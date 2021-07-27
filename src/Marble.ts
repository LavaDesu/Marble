import * as fs from "fs/promises";
import { Client, ClientOptions } from "eris";
import { Ramune, UserClient } from "ramune";
import { Score } from "ramune/lib/Responses/Score";
import { CommandContext, GatewayServer, MessageOptions, SlashCreator } from "slash-create";

import { Dev } from "./Commands/Dev";
import { Leaderboards } from "./Commands/Leaderboards";
import { MapCommand } from "./Commands/Map";
import { Ping } from "./Commands/Ping";
import { Queue } from "./Util/Queue";
import { Store } from "./Store";
import { Tracker } from "./Tracker";
import { CachedCollection } from "./Util/CachedCollection";
import { LeagueManager } from "./Util/LeagueManager";

const env = {
    botKey: process.env.MARBLE_KEY ?? "",
    botToken: process.env.MARBLE_TOKEN ?? "",
    osuID: process.env.MARBLE_ID ?? "",
    osuSecret: process.env.MARBLE_SECRET ?? "",
    webhookID: process.env.MARBLE_WEBHOOK_ID ?? "",
    webhookToken: process.env.MARBLE_WEBHOOK_TOKEN ?? ""
};


export class Marble extends Client {
    public static Instance: Marble;
    public static readonly guilds = ["376642895093956608", "522838273299841054"];
    public static readonly Environment = env;

    public readonly componentQueue: Queue<CommandContext>;
    public readonly leagueManager: LeagueManager;
    public readonly store: Store;
    public readonly tracker: Tracker;
    public ramune!: Ramune;
    public ramuneClient!: UserClient;
    private refreshToken!: string;

    private readonly slashInstance = new SlashCreator({
        // TODO: separate into env
        applicationID: "401737128792293386",
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
        this.leagueManager = new LeagueManager();
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
            .registerCommands([
                new Ping(this.slashInstance),
                new Dev(this.slashInstance),
                new Leaderboards(this.slashInstance),
                new MapCommand(this.slashInstance)
            ])
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
        Marble.guilds.forEach(async g => await this.slashInstance.syncCommandsIn(g));

        this.on("ready", async () => {
            console.log((new Date()).toISOString(), `Connected as ${this.user.username}#${this.user.discriminator} (${this.user.id})`);
            this.editStatus("online");
            await this.store.reload();
            await this.tracker.init();
        });

        this.ramune = await Ramune.create(env.osuID, env.osuSecret);
        this.refreshToken = (await fs.readFile("./.refresh", "utf8")).trim();
        this.ramuneClient = await this.ramune.createUserClient(this.refreshToken, "refresh");
        fs.writeFile("./.refresh", this.ramuneClient.token.refresh_token!, "utf8");
        this.connect();
    }
}

new Marble(env.botToken);
Marble.Instance.init();

[ "SIGINT", "SIGTERM" ].map(signal =>
    process.on(signal, async () => {
        console.log("Exiting via", signal);
        Marble.Instance.editStatus("offline");
        Marble.Instance.disconnect({ reconnect: false });
        await Marble.Instance.componentQueue.clear();
        process.exit();
    })
);
