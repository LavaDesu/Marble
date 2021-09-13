import { CommandContext, CommandOptionType } from "slash-create";
import { LeagueTracker } from "../Components/LeagueTracker";
import { Component, Dependency } from "../DependencyInjection";
import { Store } from "../Store";
import { Collection } from "../Util/Collection";
import { sanitiseDiscord } from "../Utils";
import { SlashCommandComponent } from "./SlashCommandComponent";

@Component("Command/Leaderboards")
export class LeaderboardsCommand extends SlashCommandComponent {
    @Dependency
    private readonly store!: Store;

    @Dependency
    private readonly tracker!: LeagueTracker;

    load() {
        super.create({
            name: "lb",
            description: "Gets the current leaderboards per league",
            options: [
                {
                    name: "league",
                    description: "League to get leaderboards for",
                    required: true,
                    type: CommandOptionType.STRING,
                    // XXX: Needs reload
                    choices: this.store.getLeagues().keysAsArray().map(name => ({ name, value: name }))
                }
            ],
            defaultPermission: true,
            guildIDs: this.store.getCommandGuilds()
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer();
        // Blob.Instance.componentQueue.add(ctx);

        await this.exec(ctx);
    }

    private async exec(ctx: CommandContext) {
        const league = this.store.getLeague(ctx.options.league);
        if (!league) {
            await ctx.editOriginal("Unknown league");
            return;
        }
        const sender = this.store.getPlayerByDiscord(ctx.user.id);
        if (sender)
            await this.tracker.refreshPlayer(sender.osu.id);

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

        const desc: string = points
            .entriesArray()
            .sort((a, b) => b[1] - a[1])
            .map(entry => `${entry[0]} - **${entry[1]}** points`)
            .join("\n");

        await ctx.editOriginal({
            embeds: [{
                title: `Current Rankings - ${league.name} League`,
                description: desc
            }]
        });
    }
}
