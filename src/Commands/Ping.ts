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
            // permissions: {
            //     "376642895093956608": [
            //         {
            //             type: ApplicationCommandPermissionType.USER,
            //             id: "368398754077868032",
            //             permission: true
            //         }
            //     ]
            // }
        });
    }

    async run(ctx: CommandContext) {
        await ctx.send("pong");
    }
}
