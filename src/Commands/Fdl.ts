import { ButtonStyle, CommandContext, CommandOptionType, ComponentActionRow, ComponentType, EmbedField, MessageEmbedOptions, MessageOptions } from "slash-create";
import { Database } from "../Components/Database";
import { DiscordClient } from "../Components/Discord";
import { LeagueTracker } from "../Components/LeagueTracker";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { League } from "../Database/Entities/League";
import { Map } from "../Database/Entities/Map";
import { User } from "../Database/Entities/User";
import { Collection } from "../Utils/Collection";
import { Component, Dependency, LazyDependency } from "../Utils/DependencyInjection";
import { group, sanitiseDiscord } from "../Utils/Helpers";
import { BaseCommand, Subcommand } from "./BaseCommand";

@Component("Command/Fdl")
export class FdlCommand extends BaseCommand {
    protected name = "5dl";
    protected description = "Commands related to the 5 digit league";

    @Dependency private readonly config!: ConfigStore;
    @Dependency private readonly database!: Database;
    @LazyDependency private readonly discord!: DiscordClient;
    @Dependency private readonly tracker!: LeagueTracker;

    protected setupOptions() {
        return {
            defaultPermission: true,
            guildIDs: this.config.getCommandGuilds()
        };
    }

    @Subcommand("scores", "Get scores for a map", [{
        name: "id",
        description: "Map ID to skip the interactive prompts",
        type: CommandOptionType.INTEGER,
        required: false
    }])
    public async scores(ctx: CommandContext) {
        const em = this.database.getManager();
        this.discord.componentQueue.add(ctx);
        await ctx.defer();

        const id = ctx.options.scores.id as number | undefined;
        const map = id
            ? await em.findOne(Map, id, { populate: ["scores", "scores.user"] })
            : await this.promptScores(ctx);

        if (!map) {
            const msg: MessageOptions = {
                embeds: [{
                    color: 0xFF0000,
                    description: "Unknown map"
                }],
                components: []
            };
            if (ctx.initiallyResponded)
                ctx.editOriginal(msg);
            else
                ctx.send(msg);
            return;
        }

        const sender = await em.findOne(User, { discordID: ctx.user.id });
        if (sender)
            await this.tracker.refreshPlayer(sender);

        const fields: EmbedField[] = map.scores.getItems()
            .sort((a, b) => b.score - a.score)
            .map((score, rank) => ({
                name: `#${rank + 1} - **${score.user!.username}**`,
                value: [
                    `Score: **${score.score.toLocaleString()}**${score.mods.length ? ` **+${score.mods.join("")}**` : ""}`,
                    `Accuracy: **${Math.round(score.accuracy * 10000) / 100}%**`,
                    `Rank: ${this.config.getRankEmote(score.rank)!} - ${score.count300}/${score.count100}/${score.count50}/${score.countmiss}`,
                    `Combo: **${score.combo}**/${map.maxCombo}x`,
                    `Set <t:${(new Date(score.createdAt).getTime() / 1000).toString()}:R>`,
                    score.bestID ? `[View on osu](https://osu.ppy.sh/scores/osu/${score.bestID})` : undefined
                ].filter(s => s !== undefined).join("\n")
            }));

        const embed: MessageEmbedOptions = {
            title: `${map.artist} - ${map.title} [${map.diff}]`,
            url: `https://osu.ppy.sh/b/${map.id}`,
            thumbnail: { url: `https://b.ppy.sh/thumb/${map.setID}l.jpg` },
            description: [
                `League = ${map.league.name}`,
                `Week = ${map.week}`,
                `Map ID = ${map.id}`,
                `Required Mods = \`${map.modExpression ?? "Freemod"}\``
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

    private async promptScores(ctx: CommandContext): Promise<Map> {
        const em = this.database.getManager();

        let resolve: (map: Map) => void;
        const promise: Promise<Map> = new Promise(r => resolve = r);

        const leagues = await em.find(League, {}, { populate: ["maps", "maps.scores", "maps.scores.user"] });
        const player = await em.findOne(User, { discordID: ctx.user.id });
        let league = player ? player.league : leagues[0];

        await ctx.fetch();

        const selectLeagueComponent = (): ComponentActionRow => ({
            type: ComponentType.ACTION_ROW,
            components: [{
                type: ComponentType.SELECT,
                custom_id: "select_league",
                min_values: 1,
                max_values: 1,
                options: leagues.map(subLeague => ({
                    label: `${subLeague.name} League`,
                    value: subLeague.name,
                    default: league === subLeague
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
                options: group(league.maps.getItems(), map => map.week)
                    .map(week => week.map((map, index) => ({
                        label: `Week ${map.week} Map ${index + 1} - (${map.id})`,
                        description: map.title,
                        value: map.id.toString(),
                        default: false
                    })))
                    .flat(1)
            }]
        });

        await ctx.send({
            embeds: [{
                description: `League = ${league.name}`
            }],
            components: [selectLeagueComponent(), selectMapComponent()]
        });

        ctx.registerComponent("select_league", async selectCtx => {
            league = await em.findOneOrFail(League, { name: selectCtx.values.join("") }, { populate: ["maps", "maps.scores"] });
            await selectCtx.editParent({
                embeds: [{
                    description: `League = ${league.name}`
                }],
                components: [selectLeagueComponent(), selectMapComponent()]
            });
        });
        ctx.registerComponent("select_map", selectCtx => {
            const mapID = parseInt(selectCtx.values.join(""));
            resolve!(league.maps.getItems().find(map => map.id === mapID)!);
        });

        return promise;
    }

    private async getLeaderboards(league: League, sender?: User) {
        const em = this.database.getManager();
        const maps = await em.find(Map, { league }, { populate: ["scores", "scores.user"] });

        const points: Collection<string, number> = new Collection();
        maps.forEach(map => {
            map.scores.getItems()
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .forEach((score, index) => {
                    let name = sanitiseDiscord(score.user!.username);
                    if (sender && score.user!.id === sender.id)
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
        const em = this.database.getManager();
        const league = (await em.find(League, {}, { limit: 1 }))[0];

        const sender = await em.findOne(User, { discordID: ctx.user.id });
        if (sender)
            await this.tracker.refreshPlayer(sender);

        const points = await this.getLeaderboards(league, undefined);

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
        const em = this.database.getManager();
        const league = (await em.find(League, {}, { limit: 1, populate: ["maps"] }))[0];

        const weeks = group(league.maps.getItems(), map => map.week);

        const embed = {
            author: { name: `${league.name} League` },
            fields: weeks.map((maps, week) => ({
                name: `Week ${week}`,
                value: maps
                    .map(map => `[${map.artist} - **${map.title}** \\[${map.diff}\\]](https://osu.ppy.sh/b/${map.id})`)
                    .join("\n"),
                inline: false
            })).filter(i => i)
        };
        await ctx.send({
            embeds: [embed]
        });
    }

    @Subcommand("player", "Gets league player information", [{
        name: "username",
        description: "The player's *exact* username. If omitted, will use yours if possible",
        type: CommandOptionType.STRING,
        required: false
    }])
    public async player(ctx: CommandContext) {
        const em = this.database.getManager();
        let player: User | undefined | null;
        const username = ctx.options.player.username as string | undefined;
        if (ctx.options.player.username)
            player = await em.findOne(User, { username }, { populate: ["league.maps", "league.maps.scores"] });
        else
            player = await em.findOne(User, { discordID: ctx.user.id }, { populate: ["league.maps", "league.maps.scores"] });

        if (!player) {
            await ctx.send("Player not found!", {
                ephemeral: true
            });
            return;
        }

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

        const weeks = group(player.league.maps.getItems(), map => map.week);
        weeks.forEach(week => {
            week.forEach(map => {
                fields[0].value += `[${map.title}](https://osu.ppy.sh/b/${map.id})\n`;

                let index = map.scores.getItems()
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map(score => score.user!.id)
                    .indexOf(player!.id);
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
                    name: sanitiseDiscord(player.username),
                    icon_url: `https://s.ppy.sh/a/${player.id}`
                },
                fields
            }]
        });
    }
}
