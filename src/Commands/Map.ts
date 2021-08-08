import {
    AnyComponentButton,
    ButtonStyle,
    CommandContext,
    CommandOptionType,
    ComponentActionRow,
    ComponentType,
    EmbedField,
    MessageEmbedOptions,
    MessageOptions,
    SlashCommand,
    SlashCreator
} from "slash-create";
import { Marble } from "../Marble";
import { Store, StoreMap, StoreWeek } from "../Store";

export class MapCommand extends SlashCommand {
    public static Instance: MapCommand;

    constructor(creator: SlashCreator) {
        super(creator, {
            name: "map",
            description: "Gets the current country leaderboards for a map",
            options: [
                {
                    name: "id",
                    description: "Map ID to skip the interactive prompts",
                    type: CommandOptionType.INTEGER,
                    required: false
                }
                // {
                //     name: "debug",
                //     description: "spam every map",
                //     type: CommandOptionType.BOOLEAN,
                //     required: false
                // }
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
        MapCommand.Instance = this;
    }

    async run(ctx: CommandContext) {
        await ctx.defer();
        Marble.Instance.componentQueue.add(ctx);

        const map = ctx.options.id
            ? Store.Instance.getMap(ctx.options.id)
            : await this.prompt(ctx);
        if (!map) {
            const msg: MessageOptions = {
                embeds: [{
                    color: 0xFF0000,
                    description: "Unknown map"
                }],
                components: []
            };
            if (ctx.messageID)
                ctx.editOriginal(msg);
            else
                ctx.send(msg);
            return;
        }

        await this.exec(ctx, map);
    }

    public async exec(ctx: CommandContext, map: StoreMap, debug: boolean = false) {
        const mapID = map.map.id;
        const mods = map.week.mods.get(mapID);

        const sender = Store.Instance.getPlayerByDiscord(ctx.user.id);
        if (sender)
            await Marble.Instance.tracker.refreshPlayer(sender.osu.id);

        const scores = Marble.Instance.tracker.getMapScores(map.map.id)?.valuesAsArray() ?? [];

        const fields: EmbedField[] = scores
            .filter(score => map.league.players.has(score.user!.id))
            .sort((a, b) => b.score - a.score)
            .map((score, rank) => ({
                name: `#${rank + 1} - **${score.user!.username}**`,
                value: [
                    `Score: **${score.score.toLocaleString()}**${score.mods.length ? ` **+${score.mods.join("")}**` : ""}`,
                    `Accuracy: **${Math.round(score.accuracy * 10000) / 100}%**`,
                    `Rank: ${Store.Instance.getRankEmote(score.rank)!} - ${score.statistics.count_300}/${score.statistics.count_100}/${score.statistics.count_50}/${score.statistics.count_miss}`,
                    `Combo: **${score.max_combo}**/${map.map.max_combo!}x`,
                    `Set <t:${(new Date(score.created_at).getTime() / 1000).toString()}:R>`,
                    score.best_id ? `[View on osu](https://osu.ppy.sh/scores/osu/${score.best_id})` : undefined
                ].filter(s => s !== undefined).join("\n")
            }));

        const embed: MessageEmbedOptions = {
            title: `${map.map.beatmapset!.artist} - ${map.map.beatmapset!.title} [${map.map.version}]`,
            url: map.map.url,
            thumbnail: { url: `https://b.ppy.sh/thumb/${map.map.beatmapset!.id}l.jpg` },
            description: [
                `League = ${map.league.name}`,
                `Week = ${map.week.number}`,
                `Map ID = ${map.map.id}`,
                `Required Mods = ${mods ? mods.join() : "None"}`
            ].join("\n"),
            fields: fields.slice(0, 3)
        };

        let isFull = false;
        const showAllComponent = (): ComponentActionRow => ({
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.BUTTON,
                style: ButtonStyle.PRIMARY,
                label: isFull ? "Show only top 3 scores" : "Show all scores",
                custom_id: "show_all"
            }]
        });

        if (debug) {
            await ctx.send({
                embeds: [embed]
            });
            return;
        }

        await ctx.editOriginal({
            embeds: [embed],
            components: fields.length > 3 ? [showAllComponent()] : []
        });

        ctx.registerComponent("show_all", async btnCtx => {
            if (isFull)
                embed.fields = fields.slice(0, 3);
            else
                embed.fields = fields;
            isFull = !isFull;

            await btnCtx.editParent({
                embeds: [embed],
                components: fields.length > 3 ? [showAllComponent()] : []
            });
        });
    }

    async prompt(ctx: CommandContext): Promise<StoreMap> {
        let resolve: (map: StoreMap) => void;
        const promise: Promise<StoreMap> = new Promise(r => resolve = r);

        // XXX: hardcoded Upper default
        const player = Store.Instance.getPlayerByDiscord(ctx.user.id);
        let league = player ? player.league : Store.Instance.getLeague("Upper")!;
        let week: StoreWeek;
        let map: StoreMap;

        const selectLeagueComponent = (): ComponentActionRow => ({
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.SELECT,
                custom_id: "select_league",
                min_values: 1,
                max_values: 1,
                options: Store.Instance.getLeagues().map(mapLeague => ({
                    label: `${mapLeague.name} League`,
                    value: mapLeague.name,
                    default: league === mapLeague
                }))
            }]
        });
        const selectWeekComponent = (): ComponentActionRow => ({
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.SELECT,
                custom_id: "select_week",
                placeholder: "Select a week",
                min_values: 1,
                max_values: 1,
                options: league.weeks.map(mapWeek => ({
                    label: `Week ${mapWeek.number.toString()}`,
                    value: mapWeek.number.toString(),
                    default: week === mapWeek
                }))
            }]
        });
        const selectMapComponent = (): ComponentActionRow => ({
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.SELECT,
                custom_id: "select_map",
                placeholder: "Select a map",
                min_values: 1,
                max_values: 1,
                options: week.maps.map((weekMap, id, index) => ({
                    label: `Map ${(index + 1).toString()} (${id.toString()})`,
                    description: weekMap.map.beatmapset!.title,
                    value: weekMap.map.id.toString(),
                    default: false
                }))
            }]
        });

        await ctx.send({
            embeds: [{
                description: `League = ${league.name}`
            }],
            components: [selectLeagueComponent(), selectWeekComponent()]
        });

        ctx.registerComponent("select_league", async selectCtx => {
            league = Store.Instance.getLeague(selectCtx.values.join(""))!;
            await selectCtx.editParent({
                embeds: [{
                    description: `League = ${league.name}`
                }],
                components: [selectLeagueComponent(), selectWeekComponent()]
            });
        });
        ctx.registerComponent("select_week", async selectCtx => {
            const weekPos = parseInt(selectCtx.values.join(""));
            week = league.weeks.get(weekPos)!;
            await selectCtx.editParent({
                embeds: [{
                    description: [
                        `League = ${league.name}`,
                        `Week = ${week.number}`
                    ].join("\n")
                }],
                components: [selectLeagueComponent(), selectWeekComponent(), selectMapComponent()]
            });
        });
        ctx.registerComponent("select_map", selectCtx => {
            const mapID = parseInt(selectCtx.values.join(""));
            map = week.maps.get(mapID)!;
            resolve!(map);
        });

        return promise;
    }
}
