import { EmbedOptions, User } from "eris";
import { CommandContext } from "slash-create";
import { DiscordClient } from "../Components/Discord";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { Collection } from "../Utils/Collection";
import { Component, ComponentLoad, Dependency, LazyDependency } from "../Utils/DependencyInjection";
import { BaseCommand, CommandExec } from "./BaseCommand";

@Component("Command/Snipe")
export class SnipeCommand extends BaseCommand {
    protected name = "snipe";
    protected description = "snipe the last message delete or edit in 30 seconds";

    @Dependency private readonly config!: ConfigStore;
    @LazyDependency private readonly discord!: DiscordClient;

    private readonly lastMessages: Collection<string, Ephemeral<ModifiedMessage>> = new Collection();

    @ComponentLoad
    async load() {
        await super.load();

        this.discord.on("messageDelete", msg => {
            if ("content" in msg)
                this.lastMessages.getOrSet(msg.channel.id, new Ephemeral(30e3)).set({
                    type: "delete",
                    author: msg.author,
                    messageContent: msg.content,
                    timestamp: Date.now()
                });
        });
        this.discord.on("messageUpdate", (msg, oldMsg) => {
            if ("content" in msg && oldMsg?.content)
                this.lastMessages.getOrSet(msg.channel.id, new Ephemeral(30e3)).set({
                    type: "edit",
                    author: msg.author,
                    messageContent: msg.content,
                    oldMessageContent: oldMsg?.content,
                    timestamp: Date.now()
                });
        });
    }

    setupOptions() {
        return {
            defaultPermission: true,
            guildIDs: this.config.getCommandGuilds()
        };
    }

    @CommandExec
    private async exec(ctx: CommandContext) {
        const message = this.lastMessages.get(ctx.channelID)?.get();
        if (!message)
            return await ctx.send("Nothing to snipe!", { ephemeral: true });

        const friendlyType = message.type === "delete" ? "deleted" : "edited";
        const timestamp = Math.round((Date.now() - message.timestamp) / 1000);
        const embed: EmbedOptions = {
            color: message.type === "delete" ? 0xFF0000 : 0xFF7F00,
            author: {
                name: `${message.author.username}#${message.author.discriminator}`,
                icon_url: message.author.avatarURL
            },
            footer: {
                text: `Message ${friendlyType} ${timestamp} seconds ago`
            }
        };

        if (message.type === "delete")
            embed.description = "```" + message.messageContent + "```";
        else
            embed.fields = [
                {
                    name: "Old",
                    value: "```" + message.oldMessageContent + "```"
                },
                {
                    name: "New",
                    value: "```" + message.messageContent + "```"
                }
            ];

        return await ctx.send({ embeds: [embed] });
    }
}

type ModifiedMessage = DeletedMessage | EditedMessage;

interface DeletedMessage {
    type: "delete";
    author: User;
    messageContent: string;
    timestamp: number;
}
interface EditedMessage {
    type: "edit";
    author: User;
    messageContent: string;
    oldMessageContent: string;
    timestamp: number;
}

class Ephemeral<T> {
    private data?: T;
    private readonly timeout: number;

    private nodeTimeout?: NodeJS.Timeout;

    constructor(timeout: number) {
        this.timeout = timeout;
    }

    public delete() {
        delete this.data;
    }

    public has() {
        return this.data !== undefined;
    }

    public get() {
        return this.data;
    }

    public set(data: T) {
        if (this.nodeTimeout)
            clearTimeout(this.nodeTimeout);

        this.nodeTimeout = setTimeout(this.delete.bind(this), this.timeout);

        return this.data = data;
    }
}
