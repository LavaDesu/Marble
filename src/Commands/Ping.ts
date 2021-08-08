import {
    CommandContext,
    SlashCommand,
    SlashCreator
} from "slash-create";
import { Store } from "../Store";

export class Ping extends SlashCommand {
    constructor(creator: SlashCreator) {
        super(creator, {
            name: "ping",
            description: "classic ping pong test thingy",
            defaultPermission: true,
            guildIDs: Store.Instance.getCommandGuilds()
        });
    }

    async run(ctx: CommandContext) {
        await ctx.send("pong");
    }
}
