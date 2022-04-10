import * as fs from "fs/promises";
import { ApplicationCommandPermissionType, CommandContext, CommandOptionType } from "slash-create";
import { Blob } from "../Blob";
import { DiscordClient } from "../Components/Discord";
import { LeagueTracker } from "../Components/LeagueTracker";
import { Component, Dependency, Load } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";
import { BaseCommand, Subcommand } from "./BaseCommand";

@Component("Command/Dev")
export class DevCommand extends BaseCommand {
    protected name = "dev";
    protected description = "dev commands :)";
    protected readonly logger = new Logger("Command/Dev");

    @Dependency private readonly discord!: DiscordClient;
    @Dependency private readonly tracker!: LeagueTracker;

    protected setupOptions() {
        return {
            defaultPermission: false,
            guildIDs: Blob.Environment.devGuild,
            permissions: {
                [Blob.Environment.devGuild]: [
                    {
                        type: ApplicationCommandPermissionType.USER,
                        id: Blob.Environment.devID,
                        permission: true
                    }
                ]
            }
        };
    }

    @Load
    async load() {
        await super.load();

        // Always at least sync dev
        await this.slashInstance.syncCommandsPromise();
    }


    @Subcommand("sync", "re-sync commands")
    async sync(ctx: CommandContext) {
        this.logger.debug("sync");
        await this.slashInstance.syncCommandsPromise();
        await ctx.send("synced");
    }

    @Subcommand("record", "toggle recording of new scores")
    async record(ctx: CommandContext) {
        const isRecording = this.tracker.toggleRecord();
        this.logger.debug("record", isRecording);
        await ctx.send(isRecording.toString());
    }

    @Subcommand("replay", "replay a score in tracker", [{
        type: CommandOptionType.STRING,
        name: "file",
        description: "file containing score",
        required: true
    }])
    async replay(ctx: CommandContext) {
        this.logger.debug("replay", ctx.options.replay.file);
        try {
            const file = await fs.readFile(ctx.options.replay.file, "utf8");
            const score = JSON.parse(file);
            await this.tracker.process(score);
            await ctx.send("replayed");
        } catch(e) {
            this.logger.error(e);
            await ctx.send("error :( check console");
        }
    }

    @Subcommand("clear", "clears component queue")
    async clear(ctx: CommandContext) {
        this.logger.debug("clear comp queue");
        await this.discord.componentQueue.clear();
        await ctx.send("cleared");
    }

    @Subcommand("eval", "evaluate code", [{
        type: CommandOptionType.STRING,
        name: "code",
        description: "code to evaluate",
        required: true
    }])
    async eval(ctx: CommandContext) {
        eval(ctx.options.eval.code);
        await ctx.send("eval");
    }
}
