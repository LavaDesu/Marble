import {
    ButtonStyle,
    CommandContext,
    CommandOptionType,
    ComponentActionRow,
    ComponentType,
    SlashCommand,
    SlashCreator
} from "slash-create";
import { Marble } from "../Marble";
import { Store } from "../Store";
import { Collection } from "../Util/Collection";
import { sanitiseDiscord } from "../Utils";

export class Leaderboards extends SlashCommand {
    constructor(creator: SlashCreator) {
        super(creator, {
            name: "lb",
            description: "Gets the current leaderboards per league",
            options: [
                {
                    name: "league",
                    description: "League to get leaderboards for",
                    required: true,
                    type: CommandOptionType.STRING,
                    // XXX: Needs reload
                    choices: Store.Instance.getLeagues().keysAsArray().map(name => ({ name, value: name }))
                }
            ],
            defaultPermission: true,
            guildIDs: Store.Instance.getCommandGuilds()
            // permissions: {
            //     "376642895093956608": [{
            //         type: ApplicationCommandPermissionType.USER,
            //         id: "368398754077868032",
            //         permission: true
            //     }],
            //     "522838273299841054": [{
            //         type: ApplicationCommandPermissionType.USER,
            //         id: "232117252692901890",
            //         permission: true
            //     }]
            // }
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer();
        Marble.Instance.componentQueue.add(ctx);

        await this.exec(ctx);
    }

    private async exec(ctx: CommandContext) {
        const league = Store.Instance.getLeague(ctx.options.league);
        if (!league) {
            await ctx.editOriginal("Unknown league");
            return;
        }
        const manager = Marble.Instance.leagueManager;
        const sender = Store.Instance.getPlayerByDiscord(ctx.user.id);

        let isCached = false;
        let timestamp: Date = new Date();
        // Pre-fetch everything
        const maps = (await league.weeks.asyncMap(async week =>
            await week.maps.asyncMap(async map => {
                const scores = await manager.getScores(map);
                if (scores.cached) {
                    isCached = true;
                    const time = manager.scoreCache.getSetTime(map.map.id);
                    if (time && time.getTime() < timestamp.getTime())
                        timestamp = time;
                }

                return { map, scores: scores.scores };
            })
        )).flat();

        const points: Collection<string, number> = new Collection();
        maps.forEach(map => {
            map.scores
                .filter(score => league.players.has(score.user!.id))
                .slice(0, 3)
                .forEach((score, index) => {
                    let name = sanitiseDiscord(score.user!.username);
                    if (sender && score.user!.id === sender.osu.id)
                        name = `__${name}__`;

                    const p = points.getOrSet(name, 0);
                    points.set(name, p + (3 - index));
                });
        });

        const desc: string = points
            .entriesArray()
            .sort((a, b) => b[1] - a[1])
            .map(entry => `${entry[0]} - **${entry[1]}** points`)
            .join("\n");

        // mfw O(3n)
        // const desc: string = league.players.map(player => {
        //     const debug: any[] = [];
        //     let points = 0;
        //     maps.forEach(map => {
        //         // [naming] this is kinda getting ridiculous
        //         // map.map.map.id
        //         map.scores.forEach((score, index) => {
        //             if (score.user!.id !== player.osu.id)
        //                 return;
        //             switch (index) {
        //                 case 0: {
        //                     debug.push(`3 -> ${map.map.map.beatmapset!.title}`);
        //                     points += 3;
        //                     break;
        //                 }
        //                 case 1: {
        //                     debug.push(`2 -> ${map.map.map.beatmapset!.title}`);
        //                     points += 2;
        //                     break;
        //                 }
        //                 case 2: {
        //                     debug.push(`1 -> ${map.map.map.beatmapset!.title}`);
        //                     points += 1;
        //                     break;
        //                 }
        //                 default: break;
        //             }
        //         });
        //     });
        //     debug.forEach(a => console.log(player.osu.username, a));

        //     return { name: sanitiseDiscord(player.osu.username), points };
        // })
        //     .sort((a, b) => b.points - a.points)
        //     .map(point => `${point.name} - ${point.points} points`)
        //     .join("\n");

        const forceComponent = (): ComponentActionRow[] => [{
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.BUTTON,
                style: ButtonStyle.PRIMARY,
                label: "Force refresh",
                custom_id: "force_refresh"
            }]
        }];

        await ctx.editOriginal({
            embeds: [{
                title: `Current Rankings - ${league.name} League`,
                description: desc,
                footer: isCached ? { text: "This result is cached" } : undefined,
                timestamp
            }],
            components: isCached ? forceComponent() : []
        });

        ctx.registerComponent("force_refresh", async () => {
            league.weeks.forEach(week => week.maps.forEach(map =>
                manager.scoreCache.delete(map.map.id)
            ));
            await this.exec(ctx);
        });
    }
}
