import { Message } from "eris";
import { Command, CommandComponent } from "../Utils/Commander";

@CommandComponent("Command/Ping")
export class PingCommand {
    @Command({
        name: "ping",
        prefix: ".",
        description: "classic ping pong test thingy thing thing"
    })
    protected async main(msg: Message) {
        await msg.channel.createMessage("pong");
    }
}
