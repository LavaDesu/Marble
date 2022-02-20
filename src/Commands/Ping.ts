import { CommandContext } from "slash-create";
import { Config } from "../Config";
import { Component, ComponentLoad } from "../Utils/DependencyInjection";
import { BaseCommand, CommandExec } from "./BaseCommand";

@Component("Command/Ping")
export class PingCommand extends BaseCommand {
    protected name = "ping";
    protected description = "classic ping pong test thingy thing";

    @ComponentLoad
    async load() {
        await super.load();
    }

    setupOptions() {
        return {
            defaultPermission: true,
            guildIDs: Config.commandGuilds
        };
    }

    @CommandExec
    private async exec(ctx: CommandContext) {
        await ctx.send("pong");
    }
}
