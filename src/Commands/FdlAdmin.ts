import { Ramune } from "ramune";
import { BeatmapExtended, BeatmapsetExtended } from "ramune/lib/Responses";
import { ApplicationCommandPermissionType, CommandContext, CommandOptionType } from "slash-create";
import { Blob } from "../Blob";
import { Database } from "../Components/Database";
import { LeagueTracker } from "../Components/LeagueTracker";
import { ConfigStore } from "../Components/Stores/ConfigStore";
import { League } from "../Database/Entities/League";
import { Map } from "../Database/Entities/Map";
import { User } from "../Database/Entities/User";
import { Component, Dependency, LazyDependency } from "../Utils/DependencyInjection";
import { asyncMap, sanitiseDiscord } from "../Utils/Helpers";
import { BaseCommand, Subcommand } from "./BaseCommand";

@Component("Command/5dlAdmin")
export class FdlAdminCommand extends BaseCommand {
    protected name = "5dl_admin";
    protected description = "Admin commands for 5dl";

    protected readonly ephemeralResponses = false;

    @Dependency private readonly config!: ConfigStore;
    @Dependency private readonly database!: Database;
    @LazyDependency private readonly league!: LeagueTracker;
    @Dependency private readonly ramune!: Ramune;

    protected setupOptions() {
        const fdl = this.config.getFdlSettings();
        return {
            defaultPermission: false,
            guildIDs: this.config.getCommandGuilds(),
            permissions: {
                [Blob.Environment.devGuild]: [
                    {
                        type: ApplicationCommandPermissionType.USER,
                        id: Blob.Environment.devID,
                        permission: true
                    }
                ],
                [fdl.guild]: fdl.admins.map(id => ({
                    id,
                    type: ApplicationCommandPermissionType.USER,
                    permission: true
                }))
            }
        };
    }

    @Subcommand("league", "Commands for managing leagues", [
        {
            name: "create",
            description: "Create a league",
            type: CommandOptionType.SUB_COMMAND,
            options: [
                {
                    type: CommandOptionType.STRING,
                    name: "name",
                    description: "The league name",
                    required: true
                }
            ]
        },
        {
            name: "delete",
            description: "Delete a league",
            type: CommandOptionType.SUB_COMMAND,
            options: [{
                type: CommandOptionType.STRING,
                name: "name",
                description: "The league name",
                required: true
            }]
        },
        {
            name: "list",
            description: "Lists current leagues and maps",
            type: CommandOptionType.SUB_COMMAND
        }
    ], true)
    public async leagueCmd(ctx: CommandContext) {
        const em = this.database.getManager();

        if (ctx.options.league.create) {
            const name = ctx.options.league.create.name as string;
            const exist = await em.findOne(League, { name });
            if (exist !== null)
                return await ctx.send("This league already exists!", { ephemeral: this.ephemeralResponses });

            const league = new League(name);
            await em.persistAndFlush(league);
            return await ctx.send("League created", { ephemeral: this.ephemeralResponses });
        }

        if (ctx.options.league.delete) {
            const name = ctx.options.league.delete.name as string;
            const league = await em.findOne(League, { name }, { populate: ["players"] });
            if (league === null)
                return await ctx.send("This league does not exist!", { ephemeral: this.ephemeralResponses });

            await em.removeAndFlush(league);
            return await ctx.send("League deleted", { ephemeral: this.ephemeralResponses });
        }

        if (ctx.options.league.list) {
            const league = await em.find(League, {});

            return await ctx.send("Leagues: " + league.map(l => l.name).join(", "), { ephemeral: this.ephemeralResponses });
        }

        throw new Error("Unreachable code reached");
    }

    @Subcommand("map", "Commands for league maps", [
        {
            name: "add",
            description: "Adds a (list of) map(s) to a league",
            type: CommandOptionType.SUB_COMMAND,
            options: [
                {
                    type: CommandOptionType.STRING,
                    name: "league",
                    description: "League to add maps to",
                    required: true
                },
                {
                    type: CommandOptionType.STRING,
                    name: "ids",
                    description: "List of map IDs to add, delimited by commas (`,`)",
                    required: true
                },
                {
                    type: CommandOptionType.STRING,
                    name: "week",
                    description: "The weeks these maps are in",
                    required: true
                },
                {
                    type: CommandOptionType.STRING,
                    name: "expression",
                    description: "Mod expression for these maps",
                    required: false
                }
            ]
        },
        {
            name: "delete",
            description: "Deletes a (list of) map(s)",
            type: CommandOptionType.SUB_COMMAND,
            options: [
                {
                    type: CommandOptionType.STRING,
                    name: "ids",
                    description: "List of map IDs to delete, delimited by commas (`,`)",
                    required: true
                }
            ]
        }
    ], true)
    async mapCmd(ctx: CommandContext) {
        const em = this.database.getManager();
        if (ctx.options.map.add) {
            await ctx.defer(true);

            const leagueName = ctx.options.map.add.league as string;
            const league = await em.findOne(League, { name: leagueName });
            if (league === null)
                return await ctx.send("League not found", { ephemeral: this.ephemeralResponses });

            const maps = (ctx.options.map.add.ids as string).split(",").map(i => parseInt(i));
            if (maps.find(m => isNaN(m)))
                return await ctx.send("Invalid map detected");

            const existingMaps = await em.find(Map, maps, { filters: { notDeleted: false } });

            await asyncMap(maps, async mapID => {
                const osuMap = await this.ramune.getBeatmap(mapID);
                const beatmapset = await osuMap.beatmapset?.eval();
                const args = [osuMap.raw as BeatmapExtended, beatmapset!.raw as BeatmapsetExtended] as const;
                let map = existingMaps.find(m => m.id === mapID);
                if (!map) {
                    map = new Map(...args);
                    league.maps.add(map);
                } else
                    map.reinit(...args);

                map.week = ctx.options.map.add.week;
                map.modExpression = ctx.options.map.add.expression;
            });

            await em.flush();
            await this.league.syncScores(em);
            await this.league.updateScores(em);
            await em.flush();

            return await ctx.send("Maps added", { ephemeral: this.ephemeralResponses });
        }
        if (ctx.options.map.delete) {
            await ctx.defer(true);

            const ids = ctx.options.map.delete.ids as string;
            const mapIDs = ids.split(",").map(i => parseInt(i));

            if (mapIDs.find(m => isNaN(m)))
                return await ctx.send("Invalid map detected");

            const maps = await em.find(Map, mapIDs);
            maps.forEach(map => map.deleted = new Date());
            await em.flush();

            return await ctx.send("Maps deleted", { ephemeral: this.ephemeralResponses });
        }

        throw new Error("Unreachable code reached");
    }

    @Subcommand("player", "Commands for players", [
        {
            name: "add",
            description: "Add players to a league",
            type: CommandOptionType.SUB_COMMAND,
            options: [
                {
                    type: CommandOptionType.STRING,
                    name: "ids",
                    description: "List of player IDs to add, delimited by commas",
                    required: true
                },
                {
                    type: CommandOptionType.STRING,
                    name: "discord_ids",
                    description: "List of player discord IDs (order must match ids), delimited by commas",
                    required: true
                },
                {
                    type: CommandOptionType.STRING,
                    name: "league",
                    description: "League the players should be in",
                    required: true
                }
            ]
        },
        {
            name: "delete",
            description: "Delete a player",
            type: CommandOptionType.SUB_COMMAND,
            options: [{
                type: CommandOptionType.INTEGER,
                name: "id",
                description: "The player's osu id",
                required: true
            }]
        },
        {
            name: "list",
            description: "Lists current players",
            type: CommandOptionType.SUB_COMMAND
        }
    ], true)
    public async player(ctx: CommandContext) {
        const em = this.database.getManager();

        if (ctx.options.player.add) {
            await ctx.defer(true);

            const ids = ctx.options.player.add.ids as string;
            const discordIDs = ctx.options.player.add.discord_ids as string;

            const leagueName = ctx.options.player.add.league as string;
            const league = await em.findOne(League, { name: leagueName });
            if (league === null)
                return await ctx.send("League not found", { ephemeral: this.ephemeralResponses });

            const users = ids.split(",").map(i => parseInt(i));
            if (users.find(u => isNaN(u)))
                return await ctx.send("Invalid user id detected");

            const discordUsers = discordIDs.split(",");

            if (users.length !== discordUsers.length)
                return await ctx.send("Length mismatch between user and discord list");

            const existingUsers = await em.find(User, users, { filters: { notDeleted: false } });

            await asyncMap(users, async (userID, i) => {
                const data = await this.ramune.getUser(userID);
                let user = existingUsers.find(u => u.id === userID);
                if (!user) {
                    user = new User(data.raw, discordUsers[i]);
                    league.players.add(user);
                } else
                    user.reinit(data.raw, discordUsers[i]);
            });

            await em.flush();
            await this.league.syncScores(em);
            await this.league.updateScores(em);
            await em.flush();

            return await ctx.send("Users added", { ephemeral: this.ephemeralResponses });
        }
        if (ctx.options.player.delete) {
            const id = ctx.options.player.delete.id as number;
            const user = await em.findOne(User, { id });
            if (user === null)
                return await ctx.send("This player does not exist!", { ephemeral: this.ephemeralResponses });

            user.deleted = new Date();
            await em.flush();

            return await ctx.send("User deleted", { ephemeral: this.ephemeralResponses });
        }
        if (ctx.options.player.list) {
            const leagues = await em.find(League, {}, { populate: ["players"] });
            const fields = leagues.map(l => {
                const usernames = l.players.getItems().map(p => sanitiseDiscord(p.username));
                return {
                    name: l.name,
                    value: usernames.length ? usernames.join("\n") : "No players"
                };
            });
            return await ctx.send({ embeds: [{
                title: "Player list",
                fields
            }]});
        }

        throw new Error("Unreachable code reached");
    }
}
