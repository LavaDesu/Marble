import * as fs from "fs/promises";
import * as path from "path";
import { Score as RamuneScore } from "ramune/lib/Responses";
import { ApplicationCommandPermissionType, CommandContext, CommandOptionType } from "slash-create";
import { DiscordClient } from "../Components/Discord";
import { LeagueTracker } from "../Components/LeagueTracker";
import { Config } from "../Config";
import { Component, ComponentLoad, Dependency } from "../Utils/DependencyInjection";
import { asyncMap } from "../Utils/Helpers";
import { Logger } from "../Utils/Logger";
import { BaseCommand, Subcommand } from "./BaseCommand";

@Component("Command/Dev")
export class DevCommand extends BaseCommand {
    protected name = "dev";
    protected description = "dev commands :)";
    protected readonly logger = new Logger("Command/Dev");

    @Dependency private readonly discord!: DiscordClient;
    @Dependency private readonly tracker!: LeagueTracker;

    @ComponentLoad
    async load() {
        await super.load();
    }

    protected setupOptions() {
        return {
            defaultPermission: false,
            guildIDs: Config.devGuildID,
            permissions: {
                [Config.devGuildID]: [
                    {
                        type: ApplicationCommandPermissionType.USER,
                        id: Config.devID,
                        permission: true
                    }
                ]
            }
        };
    }

    @Subcommand("sync", "re-sync commands")
    async sync(ctx: CommandContext) {
        this.logger.debug("sync");
        await this.slashInstance.syncCommandsPromise();
        await ctx.send("synced");
    }

    @Subcommand("migrate", "migrate to new database")
    async migrate(ctx: CommandContext) {
        this.logger.debug("migrate");
        try {
            const scoreNames = await fs.readdir("./scores");
            const scores = await asyncMap(scoreNames, async name => {
                const file = await fs.readFile(path.join("./scores", name), "utf8");
                const score = JSON.parse(file) as RamuneScore;
                return score;
            });
            await this.tracker.processMany(scores, false);
            await ctx.send("replayed");
        } catch(e) {
            this.logger.error(e);
            await ctx.send("error :( check console");
        }
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
