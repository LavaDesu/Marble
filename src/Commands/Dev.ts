import * as fs from "fs/promises";
import { Message } from "eris";
import { Blob } from "../Blob";
import { Command, CommandComponent, GroupDefinition } from "../Utils/Commander";
import { LeagueTracker } from "../Components/LeagueTracker";
import { Use } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";

@CommandComponent("Command/Dev")
export class DevCommand {
    protected readonly logger = new Logger("Command/Dev");

    @GroupDefinition("dev", ".dev ")
    protected async dev(msg: Message) {
        if (msg.author.id !== Blob.Environment.devID)
            return false;

        return true;
    }

    @Command({
        name: "replay",
        group: "dev",
        description: "replay a score in tracker"
    })
    async replay(
        msg: Message,
        filePath: string,
        @Use() tracker: LeagueTracker
    ) {
        this.logger.debug("replay", filePath);
        try {
            const file = await fs.readFile(filePath, "utf8");
            const score = JSON.parse(file);
            await tracker.process(score);
            await msg.channel.createMessage("replayed");
        } catch(e) {
            this.logger.error(e);
            await msg.channel.createMessage("error :( check console");
        }
    }

    @Command({
        name: "eval",
        group: "dev",
        description: "evaluate code"
    })
    async eval(msg: Message) {
        // TODO: hardcoded prefix length
        eval(msg.content.slice(10));
        await msg.channel.createMessage("eval");
    }
}
