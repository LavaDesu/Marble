import { Client, Constants as ErisConstants } from "eris";
import { CommandContext, SlashCommand } from "slash-create";

import { Blob } from "../Blob";
import { Component, ComponentLoad } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";
import { Queue } from "../Utils/Queue";

@Component("Discord")
export class DiscordClient extends Client implements Component {
    private readonly logger = new Logger("Discord");

    public componentQueue!: Queue<CommandContext>;
    public commands!: SlashCommand[];

    constructor() {
        super(Blob.Environment.botToken, {
            maxShards: "auto",
            defaultImageFormat: "png",
            defaultImageSize: 2048,
            intents: ErisConstants.Intents.guilds
                   + ErisConstants.Intents.guildInvites
                   + ErisConstants.Intents.guildMembers
        });
    }

    @ComponentLoad
    public async load(): Promise<void> {
        this.commands = [];
        this.componentQueue = new Queue(ctx => {
            if (ctx.messageID) try {
                // Using allowedMention here to clear the components safely, as in
                // without affecting the message content
                ctx.editOriginal({ allowedMentions: { everyone: false }, components: [] });
            } catch(e) {}
        }, 600e3);
        this.on("ready", () => {
            this.logger.info(`Connected as ${this.user.username}#${this.user.discriminator} (${this.user.id})`);
        });

        const p = new Promise(r => this.once("ready", r));
        this.connect();
        await p;
        this.editStatus("idle");
    }
}
