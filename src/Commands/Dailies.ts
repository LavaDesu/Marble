import { Mod } from "ramune";
import { CommandContext, CommandOptionType } from "slash-create";
import { Blob } from "../Blob";
import { DailiesStore, OperatorNode } from "../Components/Stores/DailiesStore";
import { Component, Dependency, Load } from "../Utils/DependencyInjection";
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

    @Subcommand("remove", "removes a map from the pool only if it hasn't been played", [{
        type: CommandOptionType.INTEGER,
        name: "map",
        description: "map id to remove",
        min_value: 0,
        required: true
    }])
    async remove(ctx: CommandContext) {
        const mapID: number = ctx.options.remove.map;
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

    @Subcommand("add", "adds a map to the pool", [
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
    async add(ctx: CommandContext) {
        this.logger.debug("add", ctx.options.add);
        const {
            map: mapID,
            mods: oMods,
            submitter
        }: { map: number; mods?: string; submitter?: string } = ctx.options.add;

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
                mods = oMods.match(/.{1, 2}/g) as Mod[];
            }

        await ctx.defer();
        const map = await this.store.addMap(mapID, mods, submitter);
        await this.store.sync();
        if (!map)
            await ctx.editOriginal("map not found");
        else
            await ctx.editOriginal(`added: ${map.beatmapset.artist} - ${map.beatmapset.title} [${map.map.version}] ${oMods ?? ""}`);
    }
}
