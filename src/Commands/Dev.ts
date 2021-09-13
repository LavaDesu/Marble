import * as fs from "fs/promises";
import { ApplicationCommandPermissionType, CommandContext, CommandOptionType } from "slash-create";
import { Blob } from "../Blob";
import { Component, Dependency } from "../DependencyInjection";
import { Store } from "../Store";
import { LeagueTracker } from "../Components/LeagueTracker";
import { MapCommand } from "./Map";
import { SlashCommandComponent } from "./SlashCommandComponent";
import { Logger } from "../Logger";

@Component("Command/Dev")
export class DevCommand extends SlashCommandComponent {
    private readonly logger = new Logger("Command/Dev");

    @Dependency private readonly mapCommand!: MapCommand;
    @Dependency private readonly store!: Store;
    @Dependency private readonly tracker!: LeagueTracker;

    load() {
        super.create({
            name: "dev",
            description: "dev commands :)",
            options: [
                {
                    type: CommandOptionType.SUB_COMMAND,
                    name: "record",
                    description: "toggle recordings of new scores"
                },
                {
                    type: CommandOptionType.SUB_COMMAND,
                    name: "replay",
                    description: "replay a score in tracker",
                    options: [{
                        name: "file",
                        description: "file containing score",
                        required: true,
                        type: CommandOptionType.STRING
                    }]
                },
                {
                    type: CommandOptionType.SUB_COMMAND,
                    name: "reload",
                    description: "reloads data"
                },
                {
                    type: CommandOptionType.SUB_COMMAND,
                    name: "clear",
                    description: "clears component queue"
                },
                {
                    type: CommandOptionType.SUB_COMMAND,
                    name: "dump",
                    description: "dumps every map"
                },
                {
                    type: CommandOptionType.SUB_COMMAND,
                    name: "eval",
                    description: "evaluate code",
                    options: [{
                        name: "code",
                        description: "code to evaluate",
                        required: true,
                        type: CommandOptionType.STRING
                    }]
                }
            ],
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
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer();

        if (ctx.options.record) {
            const isRecording = this.tracker.toggleRecord();
            this.logger.info("record", isRecording);
            ctx.send(isRecording.toString());
        }

        if (ctx.options.replay) {
            this.logger.info("replay", ctx.options.replay.file);
            try {
                const file = await fs.readFile(ctx.options.replay.file, "utf8");
                const score = JSON.parse(file);
                await this.tracker.process(score);
                await ctx.send("replayed");
            } catch(e) {
                this.logger.error(e);
                ctx.send("error :( check console");
            }
        }

        if (ctx.options.reload) {
            this.logger.info("reload");
            try {
                await this.store.load();
                await this.tracker.syncScores();
                await ctx.send("a ok");
            } catch(e) {
                this.logger.error(e);
                ctx.send("error :( check console");
            }
        }

        if (ctx.options.dump) {
            await ctx.send("brrr");

            const maps = this.store.getLeagues().map(league =>
                league.weeks.map(week => week.maps.valuesAsArray())
            ).flat(2);
            for (const m of maps)
                await this.mapCommand.exec(ctx, m, true);
            return;
        }

        if (ctx.options.eval) {
            eval(ctx.options.eval.code);
            await ctx.send("eval");
        }
        if (ctx.options.clear) {
            this.logger.info("clear comp queue");
            // await Blob.Instance.componentQueue.clear();
            await ctx.send("cleared");
        }
    }
}
