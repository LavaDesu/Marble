import { ButtonStyle, CommandContext, CommandOptionType, ComponentActionRow, ComponentSelectOption, ComponentType, EmbedField, MessageEmbedOptions, MessageOptions } from "slash-create";
import { DiscordClient } from "../Components/Discord";
import { LeagueTracker } from "../Components/LeagueTracker";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { League, LeagueMap, LeaguePlayer, LeagueStore } from "../Components/Stores/LeagueStore";
import { Collection } from "../Utils/Collection";
import { Component, Dependency, LazyDependency } from "../Utils/DependencyInjection";
import { sanitiseDiscord } from "../Utils/Helpers";
import { BaseCommand, Subcommand } from "./BaseCommand";

@Component("Command/Fdl")
export class FdlCommand extends BaseCommand {
    protected name = "5dl";
    protected description = "Commands related to the 5 digit league";

    @Dependency private readonly config!: ConfigStore;
    @LazyDependency private readonly discord!: DiscordClient;
    @Dependency private readonly leagueStore!: LeagueStore;
    @Dependency private readonly tracker!: LeagueTracker;

    protected setupOptions() {
        return {
            defaultPermission: true,
            guildIDs: this.config.getCommandGuilds()
        };
    }

    @Subcommand("scores", "Get scores for a map")
    public async scores(ctx: CommandContext) {
        this.discord.componentQueue.add(ctx);

        const map = await this.promptScores(ctx);

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
            url: `https://osu.ppy.sh/b/${map.map.id}`,
            thumbnail: { url: `https://b.ppy.sh/thumb/${map.beatmapset.id}l.jpg` },
            description: [
                `League = ${map.league.name}`,
                `Week = ${map.week.number}`,
                `Map ID = ${map.map.id}`,
                `Required Mods = ${this.leagueStore.getFriendlyMods(map.map.id)}`
            ].join("\n"),
            fields: fields.slice(0, 3)
        };
        ctx.initiallyResponded = true;

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

    private async promptScores(ctx: CommandContext) {
        let resolve: (map: LeagueMap) => void;
        const promise: Promise<LeagueMap> = new Promise(r => resolve = r);

        const player = this.leagueStore.getPlayerByDiscord(ctx.user.id);
        let league = player ? player.league : this.leagueStore.getLeagues().valuesAsArray()[0];
        let map: LeagueMap;

        await ctx.fetch();

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
        const selectMapComponent = (): ComponentActionRow => {
            const options: ComponentSelectOption[] = [];
            league.weeks.forEach((leagueWeek, weekNum) =>
                leagueWeek.maps.map((weekMap, id, index) =>
                    options.push({
                        label: weekMap.beatmapset.title,
                        description: `Week ${weekNum} Map ${index + 1} (${id.toString()})`,
                        value: `${weekNum}_${id}`,
                        default: false
                    })
                )
            );
            return {
                type: ComponentType.ACTION_ROW,
                components: [{
                    type: ComponentType.SELECT,
                    custom_id: "select_map",
                    placeholder: "Select a map",
                    min_values: 1,
                    max_values: 1,
                    options
                }]
            };
        };

        await ctx.send({
            embeds: [{
                description: `League = ${league.name}`
            }],
            components: [selectLeagueComponent(), selectMapComponent()]
        });

        ctx.registerComponent("select_league", async selectCtx => {
            league = this.leagueStore.getLeague(selectCtx.values.join(""))!;
            await selectCtx.editParent({
                embeds: [{
                    description: `League = ${league.name}`
                }],
                components: [selectLeagueComponent(), selectMapComponent()]
            });
        });
        ctx.registerComponent("select_map", selectCtx => {
            const [weekNum, mapID] = selectCtx.values.join("").split("_").map(p => parseInt(p));
            map = league.weeks.get(weekNum)!.maps.get(mapID)!;
            resolve!(map);
        });

        return await promise;
    }

    // TODO: update this dynamically instead of regenerating
    private getLeaderboards(league: League, sender?: LeaguePlayer) {
        const maps = this.tracker.getScores();

        const points: Collection<string, number> = new Collection();
        maps.forEach(map => {
            map.valuesAsArray()
                .filter(score => league.players.has(score.user!.id))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .forEach((score, index) => {
                    let name = sanitiseDiscord(score.user!.username);
                    if (sender && score.user!.id === sender.osu.id)
                        name = `__${name}__`;

                    const p = points.getOrSet(name, 0);
                    points.set(name, p + (3 - index));
                });
        });

        return points;
    }

    // TODO
    @Subcommand("leaderboards", "Gets the current leaderboards for a league"/*, [{
        name: "league",
        description: "League to get leaderboards for",
        required: true,
        type: CommandOptionType.STRING
        choices: this.leagueStore.getLeagues().keysAsArray().map(name => ({ name, value: name }))
    }]*/)
    public async leaderboards(ctx: CommandContext) {
        /*const league = this.leagueStore.getLeague(ctx.options.league);
        if (!league) {
            await ctx.editOriginal("Unknown league");
            return;
        }*/
        const league = this.leagueStore.getLeagues().valuesAsArray()[0];

        const sender = this.leagueStore.getPlayerByDiscord(ctx.user.id);
        if (sender)
            await this.tracker.refreshPlayer(sender.osu.id);

        const points = this.getLeaderboards(league, sender);

        const fields = [
            {
                name: "Player",
                value: "",
                inline: true
            },
            {
                name: "Score",
                value: "",
                inline: true
            }
        ];

        points
            .entriesArray()
            .sort((a, b) => b[1] - a[1])
            .forEach(entry => {
                fields[0].value += `${entry[0]}\n`;
                fields[1].value += `${entry[1]} points\n`;
            });

        await ctx.editOriginal({
            embeds: [{
                title: `Current Rankings - ${league.name} League`,
                fields
            }]
        });
    }

    // TODO: similar to above: multi-league
    @Subcommand("pool", "Gets the current league mappool")
    public async pool(ctx: CommandContext) {
        const league = this.leagueStore.getLeagues().valuesAsArray()[0];

        await ctx.send({
            embeds: [{
                author: { name: `${league.name} League` },
                fields: league.weeks.map(week => ({
                    name: `Week ${week.number}`,
                    value: week.maps
                        .map(map => {
                            let mods = this.leagueStore.getFriendlyMods(map.map.id);
                            if (mods === "Freemod :)")
                                mods = "";
                            else
                                mods = "+" + mods;
                            return `[**${map.beatmapset.title}** \\[${map.map.version}\\]](https://osu.ppy.sh/b/${map.map.id}) ${mods}`;
                        })
                        .join("\n"),
                    inline: false
                }))
            }]
        });
    }

    @Subcommand("player", "Gets league player information", [{
        name: "username",
        description: "The player's *exact* username. If omitted, will use yours if possible",
        type: CommandOptionType.STRING,
        required: false
    }])
    public async player(ctx: CommandContext) {
        let player: LeaguePlayer | undefined;
        if (ctx.options.player.username)
            player = this.leagueStore.getPlayers().find(user => user.osu.username === ctx.options.player.username);
        else
            player = this.leagueStore.getPlayerByDiscord(ctx.user.id);

        if (!player) {
            await ctx.send("Player not found!", {
                ephemeral: true
            });
            return;
        }
        const league = player.league;

        const fields = [
            {
                name: "Map",
                value: "",
                inline: true
            },
            {
                name: "Score",
                value: "",
                inline: true
            }
        ];

        const scores = this.tracker.getScores();

        league.weeks.forEach(week => {
            week.maps.forEach(map => {
                fields[0].value += `[${map.beatmapset.title}](https://osu.ppy.sh/b/${map.map.id})\n`;

                let index = scores.get(map.map.id)?.valuesAsArray()
                    .filter(score => league.players.has(score.user!.id))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map(score => score.user!.username)
                    .indexOf(player!.osu.username) ?? -1;
                if (index < 0)
                    index = 3;

                fields[1].value += `${3 - index} points\n`;
            });

            fields[0].value += "\n";
            fields[1].value += "\n";
        });

        await ctx.send({
            embeds: [{
                author: {
                    name: sanitiseDiscord(player.osu.username),
                    icon_url: `https://s.ppy.sh/a/${player.osu.id}`
                },
                fields
            }]
        });
    }
}
