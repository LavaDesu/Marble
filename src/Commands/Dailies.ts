import { Mod } from "ramune";
import { CommandContext, CommandOptionType } from "slash-create";
import { Blob } from "../Blob";
import { DailiesTracker } from "../Components/DailiesTracker";
import { DiscordClient } from "../Components/Discord";
import { DailiesStore, OperatorNode } from "../Components/Stores/DailiesStore";
import { WrappedRamune } from "../Components/WrappedRamune";
import { Component, Dependency, Inject, Load, Use } from "../Utils/DependencyInjection";
import { sanitiseDiscord } from "../Utils/Helpers";
import { Logger } from "../Utils/Logger";
import { BaseCommand, Subcommand } from "./BaseCommand";

@Component("Command/Dailies")
export class DailiesCommand extends BaseCommand {
    protected name = "dailies";
    protected description = "Manage dailies";
    protected readonly logger = new Logger("Command/Dailies");

    @Dependency private readonly store!: DailiesStore;

    protected setupOptions() {
        return {
            requiredPermissions: ["MANAGE_GUILD"],
            guildIDs: Blob.Environment.devGuild
        };
    }

    @Load
    async load() {
        await super.load();
    }

    @Subcommand("list", "lists mappool")
    async list(ctx: CommandContext) {
        await ctx.send({ embeds: [{
            title: "Mappool",
            description: this.store.getMaps().map(map => {
                let ret = `<t:${Math.ceil(map.timeRange[0] / 1000)}:d> ${map.beatmapset.artist} - ${map.beatmapset.title} [${map.map.version}]`;
                if (map === this.store.currentMap)
                    ret = `**__${ret}__**`;

                return ret;
            }).join("\n")
        }] });
    }

    @Subcommand("remove_player", "removes a player", [{
        type: CommandOptionType.INTEGER,
        name: "user",
        description: "osu user id",
        min_value: 0,
        required: true
    }])
    async removePlayer(ctx: CommandContext) {
        this.logger.debug("remove", ctx.options.remove_player.user);
        const osuID: number = ctx.options.remove_player.user;
        const discID = this.store.getDiscordFromOsu(osuID);

        const players = this.store.getPlayers();
        const discordPlayers = this.store.getPlayersByDiscord();
        if (!players.has(osuID)) {
            await ctx.send("user not found!");
            return;
        }

        players.delete(osuID);
        if (discID)
            discordPlayers.delete(discID);

        await this.store.sync();
        await ctx.send("user removed");
    }

    @Subcommand("add_player", "adds a player to be tracked", [
        {
            type: CommandOptionType.USER,
            name: "discord_user",
            description: "discord user",
            required: true
        },
        {
            type: CommandOptionType.INTEGER,
            name: "osu_user",
            description: "osu user id",
            min_value: 0,
            required: true
        }
    ])
    @Inject
    async addPlayer(ctx: CommandContext, @Use() ramune: WrappedRamune, @Use() tracker: DailiesTracker) {
        this.logger.debug("add", ctx.options.add_player);
        const discID: string = ctx.options.add_player.discord_user;
        const osuID: number = ctx.options.add_player.osu_user;
        const players = this.store.getPlayers();
        const discordPlayers = this.store.getPlayersByDiscord();
        if (players.has(osuID)) {
            await ctx.send("user is already added!");
            return;
        }

        let user;
        try {
            user = await ramune.getUser(osuID);
        } catch(e) {
            await ctx.send("user not found or error occurred!");
            return;
        }

        players.set(osuID, user);
        discordPlayers.set(discID, user);
        await this.store.sync();
        await tracker.refreshPlayer(osuID);
        await ctx.send("user added: " + user.username);
    }

    @Subcommand("remove_map", "removes a map from the pool only if it hasn't been played", [{
        type: CommandOptionType.INTEGER,
        name: "map",
        description: "map id to remove",
        min_value: 0,
        required: true
    }])
    async removeMap(ctx: CommandContext) {
        const mapID: number = ctx.options.remove_map.map;
        this.logger.debug("remove", mapID);
        const maps = this.store.getMaps();
        const map = maps.get(mapID);
        if (map === undefined) {
            await ctx.send("map id not found!");
            return;
        }
        if (map.timeRange[0] < Date.now()) {
            await ctx.send("map is already being played!");
            return;
        }

        maps.delete(mapID);
        this.store.recalcEpoch();
        await this.store.sync();
        await ctx.send("map removed");
    }

    @Subcommand("add_map", "adds a map to the pool", [
        {
            type: CommandOptionType.INTEGER,
            name: "map",
            description: "map id to add",
            min_value: 0,
            required: true
        },
        {
            type: CommandOptionType.STRING,
            name: "mods",
            description: "mods for the map",
            required: false
        },
        {
            type: CommandOptionType.STRING,
            name: "submitter",
            description: "name of submitter",
            required: false
        }
    ])
    async addMap(ctx: CommandContext) {
        this.logger.debug("add", ctx.options.add_map);
        const {
            map: mapID,
            mods: oMods,
            submitter
        }: { map: number; mods?: string; submitter?: string } = ctx.options.add_map;

        let mods: OperatorNode | undefined;
        if (oMods !== undefined)
            if (oMods.endsWith("+"))
                if (oMods.length === 3)
                    mods = oMods.substring(0, 2) as Mod;
                else {
                    await ctx.send("only one mod can be set for mod + fm");
                    return;
                }
            else if (oMods.includes("|")) {
                mods = {
                    OR: oMods.split("|").map<Mod[]>(i => {
                        if (i.length % 2 !== 0)
                            return 0 as any;
                        return i.match(/.{1,2}/g);
                    })
                };
                if (mods.OR.some(v => v as any === 0)) {
                    await ctx.send("invalid mods detected");
                    return;
                }
            }
            else {
                if (oMods.length % 2 !== 0) {
                    await ctx.send("invalid mods detected");
                    return;
                }
                mods = oMods.match(/.{1,2}/g) as Mod[];
            }

        await ctx.defer();
        const map = await this.store.addMap(mapID, mods, submitter);
        await this.store.sync();
        if (!map)
            await ctx.editOriginal("map not found");
        else
            await ctx.editOriginal(`added: ${map.beatmapset.artist} - ${map.beatmapset.title} [${map.map.version}] ${oMods ?? ""}`);
    }

    @Subcommand("get_points", "Get points for a player", [
        {
            type: CommandOptionType.INTEGER,
            name: "player_id",
            description: "osu id of player",
            required: true
        }
    ])
    async getPoints(ctx: CommandContext) {
        const playerID: number = ctx.options.get_points.player_id;
        const player = this.store.getPlayers().get(playerID);
        if (!player)
            return await ctx.send(`Unknown player ${playerID}`);
        const playerPoints = this.store.getPlayerPoints().get(playerID) ?? 0;
        return await ctx.send(`${sanitiseDiscord(player.username)}'s points: ${playerPoints}`);
    }

    @Subcommand("refresh_country", "Refresh players in country", [
        {
            type: CommandOptionType.INTEGER,
            name: "max_players",
            description: "maximum number of active players to check, default 50",
            min_value: 0,
            required: false
        }
    ])
    @Inject
    async refreshCountry(ctx: CommandContext, @Use() tracker: DailiesTracker) {
        const maxPlayers: number = ctx.options.refresh_country.max_players ?? 50;

        await ctx.defer();
        const [counter, ncounter] = await tracker.fetchCountryUsers(maxPlayers);

        await ctx.editOriginal(`Fetched ${counter} players, ${ncounter} new`);
    }

    @Subcommand("setup_scoreboard", "Setup a scoreboard")
    @Inject
    async setupScoreboard(ctx: CommandContext, @Use() discord: DiscordClient, @Use() tracker: DailiesTracker) {
        await ctx.defer(true);

        const msg = await discord.createMessage(ctx.channelID, { embed: tracker.calcEmbed() });
        this.store.scoreboardID = [ctx.channelID, msg.id];
        await this.store.sync();
        await ctx.send("done", { ephemeral: true });
    }
}
