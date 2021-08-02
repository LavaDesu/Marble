import * as fs from "fs/promises";
import { ApplicationCommandPermissionType, CommandContext, CommandOptionType, SlashCommand, SlashCreator } from "slash-create";
import { Marble } from "../Marble";
import { Store } from "../Store";
import { MapCommand } from "./Map";

export class Dev extends SlashCommand {
    constructor(creator: SlashCreator) {
        super(creator, {
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
            // TODO: these are hardcoded
            guildIDs: "376642895093956608",
            permissions: {
                "376642895093956608": [
                    {
                        type: ApplicationCommandPermissionType.USER,
                        id: "368398754077868032",
                        permission: true
                    }
                ]
            }
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer();

        if (ctx.options.record) {
            const isRecording = Marble.Instance.tracker.toggleRecord();
            console.log("record", isRecording);
            ctx.send(isRecording.toString());
        }

        if (ctx.options.replay) {
            console.log("replay", ctx.options.replay.file);
            try {
                const file = await fs.readFile(ctx.options.replay.file, "utf8");
                const score = JSON.parse(file);
                await Marble.Instance.tracker.process(score);
                await ctx.send("replayed");
            } catch(e) {
                console.error(e);
                ctx.send("error :( check console");
            }
        }

        if (ctx.options.reload) {
            console.log("reload");
            try {
                await Store.Instance.reload();
                await ctx.send("a ok");
            } catch(e) {
                console.error(e);
                ctx.send("error :( check console");
            }
        }

        if (ctx.options.dump) {
            await ctx.send("brrr");

            const manager = Marble.Instance.leagueManager;
            const maps = (await Store.Instance.getLeagues().asyncMap(async league =>
                await league.weeks.asyncMap(async week =>
                    await week.maps.asyncMap(async weekMap => {
                        await manager.getScores(weekMap);
                        return weekMap;
                    })
                )
            )).flat(2);
            for (const m of maps)
                await MapCommand.Instance.exec(ctx, m, true);
            return;
        }

        if (ctx.options.eval) {
            eval(ctx.options.eval.code);
            // eslint-disable-next-line
            // await Object.getPrototypeOf(async function() {}).constructor(ctx.options.eval.code)();
            await ctx.send("eval");
        }
        if (ctx.options.clear) {
            console.log("clear comp queue");
            await Marble.Instance.componentQueue.clear();
            await ctx.send("cleared");
        }
    }
}
