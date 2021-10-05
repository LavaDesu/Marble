import * as fs from "fs/promises";
import { ApplicationCommandPermissionType, CommandContext, CommandOptionType } from "slash-create";
import { Blob } from "../Blob";
import { DiscordClient } from "../Components/Discord";
import { LeagueTracker } from "../Components/LeagueTracker";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { LeagueStore } from "../Components/Stores/LeagueStore";
import { Component, ComponentLoad, Dependency } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";
import { BaseCommand, Subcommand } from "./BaseCommand";
import { MapCommand } from "./Map";

@Component("Command/Dev")
export class DevCommand extends BaseCommand {
    protected name = "dev";
    protected description = "dev commands :)";
    protected readonly logger = new Logger("Command/Dev");

    @Dependency private readonly discord!: DiscordClient;
    @Dependency private readonly leagueStore!: LeagueStore;
    @Dependency private readonly mapCommand!: MapCommand;
    @Dependency private readonly tracker!: LeagueTracker;

    @ComponentLoad
    async load() {
        await super.load();
    }

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

    @Subcommand("reload", "reloads store data")
    async reload(ctx: CommandContext) {
        this.logger.debug("reload");
        try {
            this.slashInstance.ready = false;
            await this.slashInstance.reloadComponent(ConfigStore);
            await this.slashInstance.reloadComponent(LeagueStore);
            this.slashInstance.ready = true;
            await this.slashInstance.requestSync();
            // await this.store.load();
            // await this.tracker.syncScores();
            await ctx.send("a ok");
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

    @Subcommand("dump", "dumps every league map")
    async dump(ctx: CommandContext) {
        await ctx.send("brrr");

        const maps = this.leagueStore.getLeagues().map(league =>
            league.weeks.map(week => week.maps.valuesAsArray())
        ).flat(2);

        for (const m of maps)
            await this.mapCommand.exec(ctx, m, true);
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
