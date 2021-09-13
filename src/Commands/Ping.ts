import { CommandContext } from "slash-create";
import { Component, Dependency } from "../DependencyInjection";
import { Store } from "../Store";
import { SlashCommandComponent } from "./SlashCommandComponent";

@Component("Command/Ping")
export class PingCommand extends SlashCommandComponent {
    @Dependency
    private readonly store!: Store;

    load() {
        super.create({
            name: "ping",
            description: "classic ping pong test thingy",
            defaultPermission: true,
            guildIDs: this.store.getCommandGuilds()
        });
    }

    async run(ctx: CommandContext) {
        await ctx.send("pong");
    }
}
