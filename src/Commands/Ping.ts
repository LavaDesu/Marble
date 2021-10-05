import { CommandContext } from "slash-create";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { Component, ComponentLoad, Dependency } from "../Utils/DependencyInjection";
import { BaseCommand, CommandExec } from "./BaseCommand";

@Component("Command/Ping")
export class PingCommand extends BaseCommand {
    protected name = "ping";
    protected description = "classic ping pong test thingy thing";

    @Dependency
    private readonly config!: ConfigStore;

    @ComponentLoad
    async load() {
        await super.load();
    }

    setupOptions() {
        return {
            defaultPermission: true,
            guildIDs: this.config.getCommandGuilds()
        };
    }

    @CommandExec
    private async exec(ctx: CommandContext) {
        await ctx.send("pong");
    }
}
