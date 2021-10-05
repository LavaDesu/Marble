import {
    ButtonStyle,
    CommandContext,
    CommandOptionType,
    ComponentActionRow,
    ComponentType,
    EmbedField,
    MessageEmbedOptions,
    MessageOptions
} from "slash-create";
import { DiscordClient } from "../Components/Discord";
import { LeagueTracker } from "../Components/LeagueTracker";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { LeagueStore, LeagueMap, LeagueWeek } from "../Components/Stores/LeagueStore";
import { Component, Dependency, LazyDependency } from "../Utils/DependencyInjection";
import { BaseCommand, CommandExec } from "./BaseCommand";

@Component("Command/Map")
export class MapCommand extends BaseCommand {
    protected name = "map";
    protected description = "Gets the current country leaderboards for a map";

    @Dependency private readonly config!: ConfigStore;
    @LazyDependency private readonly discord!: DiscordClient;
    @Dependency private readonly leagueStore!: LeagueStore;
    @Dependency private readonly tracker!: LeagueTracker;

    setupOptions() {
        return {
            defaultPermission: true,
            guildIDs: this.config.getCommandGuilds(),
            options: [
                {
                    name: "id",
                    description: "Map ID to skip the interactive prompts",
                    type: CommandOptionType.INTEGER,
                    required: false
                }
            ]
        };
    }

    @CommandExec
    async run(ctx: CommandContext) {
        this.discord.componentQueue.add(ctx);

        const map = ctx.options.id
            ? this.leagueStore.getMap(ctx.options.id)
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

    public async exec(ctx: CommandContext, map: LeagueMap, debug: boolean = false) {
        const sender = this.leagueStore.getPlayerByDiscord(ctx.user.id);
        if (sender)
            await this.tracker.refreshPlayer(sender.osu.id);

        const scores = this.tracker.getMapScores(map.map.id)?.valuesAsArray() ?? [];

        const fields: EmbedField[] = scores
            .filter(score => map.league.players.has(score.user!.id))
            .sort((a, b) => b.score - a.score)
            .map((score, rank) => ({
                name: `#${rank + 1} - **${score.user!.username}**`,
                value: [
                    `Score: **${score.score.toLocaleString()}**${score.mods.length ? ` **+${score.mods.join("")}**` : ""}`,
                    `Accuracy: **${Math.round(score.accuracy * 10000) / 100}%**`,
                    `Rank: ${this.config.getRankEmote(score.rank)!} - ${score.statistics.count_300}/${score.statistics.count_100}/${score.statistics.count_50}/${score.statistics.count_miss}`,
                    `Combo: **${score.max_combo}**/${map.map.maxCombo!}x`,
                    `Set <t:${(new Date(score.created_at).getTime() / 1000).toString()}:R>`,
                    score.best_id ? `[View on osu](https://osu.ppy.sh/scores/osu/${score.best_id})` : undefined
                ].filter(s => s !== undefined).join("\n")
            }));

        const embed: MessageEmbedOptions = {
            title: `${map.beatmapset.artist} - ${map.beatmapset.title} [${map.map.version}]`,
            url: map.map.url,
            thumbnail: { url: `https://b.ppy.sh/thumb/${map.beatmapset.id}l.jpg` },
            description: [
                `League = ${map.league.name}`,
                `Week = ${map.week.number}`,
                `Map ID = ${map.map.id}`,
                `Required Mods = ${this.leagueStore.getFriendlyMods(map.map.id)}`
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

    async prompt(ctx: CommandContext): Promise<LeagueMap> {
        let resolve: (map: LeagueMap) => void;
        const promise: Promise<LeagueMap> = new Promise(r => resolve = r);

        // XXX: hardcoded Upper default
        const player = this.leagueStore.getPlayerByDiscord(ctx.user.id);
        let league = player ? player.league : this.leagueStore.getLeague("Upper")!;
        let week: LeagueWeek;
        let map: LeagueMap;

        const selectLeagueComponent = (): ComponentActionRow => ({
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.SELECT,
                custom_id: "select_league",
                min_values: 1,
                max_values: 1,
                options: this.leagueStore.getLeagues().map(mapLeague => ({
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
                    description: weekMap.beatmapset.title,
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
            league = this.leagueStore.getLeague(selectCtx.values.join(""))!;
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
