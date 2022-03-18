import { ActionRow, ComponentInteractionSelectMenuData, Constants as ErisConstants, EmbedField, EmbedOptions, InteractionButton, Message, SelectMenu, SelectMenuOptions, TextChannel } from "eris";
import { ComponentManager } from "../Components/ComponentManager";
import { LeagueTracker } from "../Components/LeagueTracker";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { League, LeagueMap, LeaguePlayer, LeagueStore } from "../Components/Stores/LeagueStore";
import { Utils } from "../Utils";
import { Collection } from "../Utils/Collection";
import { Command, CommandComponent, GroupDefinition } from "../Utils/Commander";
import { Use } from "../Utils/DependencyInjection";
import { sanitiseDiscord } from "../Utils/Helpers";

@CommandComponent("Command/Fdl")
export class FdlCommand {
    protected name = "5dl";
    protected description = "Commands related to the 5 digit league";

    @GroupDefinition("5dl", ".")
    public async fdl(msg: Message, @Use() config: ConfigStore) {
        if (!config.getCommandGuilds().includes(msg.channel.id))
            return false;

        return true;
    }

    @Command({
        name: "scores",
        group: "5dl",
        description: "Get scores for a map"
    })
    public async scores(
        msg: Message, id: number,
        @Use() config: ConfigStore,
        @Use() leagueStore: LeagueStore,
        @Use() tracker: LeagueTracker,
        @Use() cm: ComponentManager
    ) {
        let map: LeagueMap | undefined;
        if (id)
            map = leagueStore.getMap(id);
        else
            map = await this.promptScores(msg, cm, leagueStore);

        if (!map) {
            const res = await msg.channel.createMessage("Map not found!");
            setTimeout(async () => await res.delete(), 5e3);
            return;
        }

        const sender = leagueStore.getPlayerByDiscord(msg.author.id);
        if (sender)
            await tracker.refreshPlayer(sender.osu.id);

        const scores = tracker.getMapScores(map.map.id)?.valuesAsArray() ?? [];

        const fields: EmbedField[] = scores
            .filter(score => map!.league.players.has(score.user!.id))
            .sort((a, b) => b.score - a.score)
            .map((score, rank) => ({
                name: `#${rank + 1} - **${score.user!.username}**`,
                value: [
                    `Score: **${score.score.toLocaleString()}**${score.mods.length ? ` **+${score.mods.join("")}**` : ""}`,
                    `Accuracy: **${Math.round(score.accuracy * 10000) / 100}%**`,
                    `Rank: ${config.getRankEmote(score.rank)!} - ${score.statistics.count_300}/${score.statistics.count_100}/${score.statistics.count_50}/${score.statistics.count_miss}`,
                    `Combo: **${score.max_combo}**\/${map!.map.maxCombo!}x`,
                    `Set <t:${(new Date(score.created_at).getTime() / 1000).toString()}:R>`,
                    score.best_id ? `[View on osu](https://osu.ppy.sh/scores/osu/${score.best_id})` : undefined
                ].filter(s => s !== undefined).join("\n")
            }));

        const embed: EmbedOptions = {
            title: `${map.beatmapset.artist} - ${map.beatmapset.title} [${map.map.version}]`,
            url: `https://osu.ppy.sh/b/${map.map.id}`,
            thumbnail: { url: `https://b.ppy.sh/thumb/${map.beatmapset.id}l.jpg` },
            description: [
                `League = ${map.league.name}`,
                `Week = ${map.week.number}`,
                `Map ID = ${map.map.id}`,
                // FIXME: Hardcoded command name
                `Short Command = \`.scores ${map.map.id}\``,
                `Required Mods = ${leagueStore.getFriendlyMods(map.map.id)}`
            ].join("\n"),
            fields: fields.slice(0, 3)
        };

        let isFull = false;
        const showAllButton = (): InteractionButton => cm.register(async int => {
            if (isFull)
                embed.fields = fields.slice(0, 3);
            else
                embed.fields = fields;
            isFull = !isFull;

            await int.editParent({ embeds: [embed], components: showAllComponent() });
        }, {
            type: ErisConstants.ComponentTypes.BUTTON,
            style: ErisConstants.ButtonStyles.PRIMARY,
            label: isFull ? "Show only top 3 scores" : "Show all scores"
        });
        const showAllComponent = () => Utils.wrapComponents(showAllButton());

        await msg.channel.createMessage({ embed, components: fields.length > 3 ? showAllComponent() : undefined });
    }

    protected async promptScores(
        msg: Message,
        cm: ComponentManager,
        leagueStore: LeagueStore
    ) {
        let resolve: (map: LeagueMap) => void;
        const promise: Promise<LeagueMap> = new Promise(r => resolve = r);

        const player = leagueStore.getPlayerByDiscord(msg.author.id);
        let league = player ? player.league : leagueStore.getLeagues().valuesAsArray()[0];
        let map: LeagueMap;

        const selectLeagueComponent = (): SelectMenu => cm.register(async int => {
            const selected = (int.data as ComponentInteractionSelectMenuData).values.join("");
            league = leagueStore.getLeague(selected)!;
            await int.editParent({
                embeds: [{
                    description: "Select a map!"
                }],
                components: createComponents()
            });
        }, {
            type: ErisConstants.ComponentTypes.SELECT_MENU,
            min_values: 1,
            max_values: 1,
            options: leagueStore.getLeagues().map(mapLeague => ({
                label: `${mapLeague.name} League`,
                value: mapLeague.name,
                default: league === mapLeague
            }))
        });
        const selectMapComponent = (): SelectMenu => {
            const options: SelectMenuOptions[] = [];
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
            return cm.register(async int => {
                const selected = (int.data as ComponentInteractionSelectMenuData).values.join("");
                const [weekNum, mapID] = selected.split("_").map(p => parseInt(p));
                map = league.weeks.get(weekNum)!.maps.get(mapID)!;
                await int.acknowledge();
                await int.deleteOriginalMessage();
                resolve!(map);
            }, {
                type: ErisConstants.ComponentTypes.SELECT_MENU,
                custom_id: "select_map",
                placeholder: "Select a map",
                min_values: 1,
                max_values: 1,
                options
            });
        };

        const createComponents = (): ActionRow[] => Utils.wrapComponents([selectLeagueComponent(), selectMapComponent()]);

        await msg.channel.createMessage({
            embeds: [{
                description: "Select a map!"
            }],
            components: createComponents()
        });

        return await promise;
    }

    // TODO: update this dynamically instead of regenerating
    protected getLeaderboards(league: League, tracker: LeagueTracker, sender?: LeaguePlayer) {
        const maps = tracker.getScores();

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

    @Command({
        name: "lb",
        group: "5dl",
        description: "Gets the current leaderboards for a league"
    })
    public async leaderboards(
        msg: Message, leagueName: string,
        @Use() leagueStore: LeagueStore,
        @Use() tracker: LeagueTracker
    ) {
        let league: League | undefined;
        if (leagueName) {
            league = leagueStore.getLeague(leagueName);

            if (!league) {
                const res = await msg.channel.createMessage("League not found!");
                setTimeout(async () => await res.delete(), 5e3);
                return;
            }
        } else
            league = leagueStore.getLeagues().valuesAsArray()[0];

        const sender = leagueStore.getPlayerByDiscord(msg.author.id);
        if (sender)
            await tracker.refreshPlayer(sender.osu.id);

        const points = this.getLeaderboards(league, tracker, sender);

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

        await msg.channel.createMessage({
            embeds: [{
                title: `Current Rankings - ${league.name} League`,
                fields
            }]
        });
    }

    @Command({
        name: "pool",
        group: "5dl",
        description: "Gets the current league mappool"
    })
    public async pool(
        msg: Message, leagueName: string,
        @Use() leagueStore: LeagueStore
    ) {
        let league: League | undefined;
        if (leagueName) {
            league = leagueStore.getLeague(leagueName);

            if (!league) {
                await msg.channel.createMessage("Unknown league");
                return;
            }
        } else
            league = leagueStore.getLeagues().valuesAsArray()[0];

        await msg.channel.createMessage({
            embeds: [{
                author: { name: `${league.name} League` },
                fields: league.weeks.map(week => ({
                    name: `Week ${week.number}`,
                    value: week.maps
                        .map(map => {
                            let mods = leagueStore.getFriendlyMods(map.map.id);
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

    @Command({
        name: "player",
        group: "5dl",
        description: "Gets league player information"
    })
    public async player(
        msg: Message<TextChannel>, username: string,
        @Use() leagueStore: LeagueStore,
        @Use() tracker: LeagueTracker
    ) {
        let player: LeaguePlayer | undefined;
        if (username)
            player = leagueStore.getPlayers().find(user => user.osu.username === username);
        else
            player = leagueStore.getPlayerByDiscord(msg.author.id);

        if (!player) {
            const res = await msg.channel.createMessage("Player not found!");
            setTimeout(async () => await res.delete(), 5e3);
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

        const scores = tracker.getScores();

        league.weeks.forEach(week => {
            week.maps.forEach(map => {
                fields[0].value += `[${map.beatmapset.title}](https://osu.ppy.sh/b/${map.map.id})\n`;

                let index = scores.get(map.map.id)!.valuesAsArray()
                    .filter(score => league.players.has(score.user!.id))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3)
                    .map(score => score.user!.username)
                    .indexOf(player!.osu.username);
                if (index < 0)
                    index = 3;

                fields[1].value += `${3 - index} points\n`;
            });

            fields[0].value += "\n";
            fields[1].value += "\n";
        });

        await msg.channel.createMessage({
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
