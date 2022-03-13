import { Client, Constants as ErisConstants } from "eris";

import { Blob } from "../Blob";
import { Component, Load, Unload } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";

@Component("Discord")
export class DiscordClient extends Client implements Component {
    private readonly logger = new Logger("Discord");

    constructor() {
        super(Blob.Environment.botToken, {
            maxShards: "auto",
            defaultImageFormat: "png",
            defaultImageSize: 2048,
            intents: ErisConstants.Intents.guilds
                   + ErisConstants.Intents.guildInvites
                   + ErisConstants.Intents.guildMembers
                   + ErisConstants.Intents.guildMessages
        });
    }

    @Load
    public async load(): Promise<void> {
        this.on("ready", () => {
            this.logger.info(`Connected as ${this.user.username}#${this.user.discriminator} (${this.user.id})`);
        });

        const p = new Promise(r => this.once("ready", r));
        this.connect();
        await p;
        this.editStatus("idle");
    }

    @Unload
    public async unload() {
        this.disconnect({ reconnect: false });
    }
}
