import { GatewayServer, MessageOptions, SlashCreator } from "slash-create";
import { Blob } from "../Blob";
import { Component, ComponentLoad, Export, LazyDependency, PreUnload, Provider } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";
import { DiscordClient } from "./Discord";
import { DevCommand } from "../Commands/Dev";
import { PingCommand } from "../Commands/Ping";
import { SnipeCommand } from "../Commands/Snipe";
import { FdlCommand } from "../Commands/Fdl";

export interface SlashHandler extends Provider {}
@Provider
@Component("SlashHandler")
export class SlashHandler extends SlashCreator {
    private readonly logger = new Logger("SlashHandler");

    @LazyDependency private readonly discord!: DiscordClient;

    @Export private readonly devCommand: DevCommand;
    @Export private readonly fdlCommand: FdlCommand;
    @Export private readonly pingCommand: PingCommand;
    @Export private readonly snipeCommand: SnipeCommand;

    public ready: boolean;

    constructor() {
        super({
            applicationID: Blob.Environment.botID,
            publicKey: Blob.Environment.botKey,
            token: Blob.Environment.botToken
        });

        this
            .on("commandBlock", (cmd, _, reason, data) => {
                this.logger.error("Command blocked", cmd.commandName, reason, data);
            })
            .on("commandError", (cmd, err, ctx) => {
                this.logger.error("Command errored", cmd.commandName, err);

                const response: MessageOptions = {
                    content: "An error occured :(",
                    embeds: [],
                    components: []
                };
                if (ctx.messageID)
                    ctx.editOriginal(response);
                else
                    ctx.send(response);
            })
            .on("error", (e) => {
                this.logger.error("Unknown slash error", e);
            });

        this.devCommand = new DevCommand(this);
        this.fdlCommand = new FdlCommand(this);
        this.pingCommand = new PingCommand(this);
        this.snipeCommand = new SnipeCommand(this);

        this.ready = false;
    }

    @ComponentLoad
    async load() {
        this.withServer(new GatewayServer(handler => {
            this.discord.on("rawWS", e => {
                if (e.t === "INTERACTION_CREATE")
                    handler(e.d as any);
            });
        }));

        await this.syncCommandsPromise();
        this.ready = true;
    }

    @PreUnload
    preUnload() {
        this.ready = false;
    }

    async unload() {
        if (!Blob.Environment.development)
            await this.syncCommandsPromise();
    }

    public async requestSync() {
        if (this.ready)
            await this.syncCommandsPromise();
    }

    /** Copy of {@link SlashCreator.syncCommands} to return a Promise instead */
    public async syncCommandsPromise(opts?: SyncCommandOptions) {
        this.logger.debug("Syncing");
        const options = {
            deleteCommands: true,
            syncGuilds: true,
            skipGuildErrors: true,
            syncPermissions: true,
            ...opts
        };

        let guildIDs: string[] = [];

        // Collect guild IDs with specific commands
        for (const [, command] of this.commands)
            if (command.guildIDs) guildIDs = [...new Set([...guildIDs, ...command.guildIDs])];

        await this.syncGlobalCommands(options.deleteCommands);

        // Sync guild commands
        for (const guildID of guildIDs)
            try {
                await this.syncCommandsIn(guildID, options.deleteCommands);
            } catch (e) {
                if (options.skipGuildErrors)
                    this.emit("warn", `An error occurred during guild sync (${guildID}): ${e.message as string}`);
                else
                    throw e;
            }

        this.emit("debug", "Finished syncing commands");

        if (options.syncPermissions)
            try {
                await this.syncCommandPermissions();
            } catch (e) {
                this.emit("error", e);
            }

        this.emit("synced");
        return this;
    }
}

/** The options for {@link SlashCreator#syncCommands}. */
interface SyncCommandOptions {
    /** Whether to delete commands that do not exist in the creator. */
    deleteCommands?: boolean;
    /** Whether to sync guild-specific commands. */
    syncGuilds?: boolean;
    /**
     * Whether to skip over guild syncing errors.
     * Guild syncs most likely can error if that guild no longer exists.
     */
    skipGuildErrors?: boolean;
    /** Whether to sync command permissions after syncing commands. */
    syncPermissions?: boolean;
}
