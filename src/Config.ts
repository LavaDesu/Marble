import { existsSync, readFileSync } from "fs";
import { ScoreRank } from "ramune";

export interface Config {
    /**
     * Whether to run in debug mode (extra logs amongst other stuff)
     * Default: process.env.NODE_ENV === "development"
     */
    debug: boolean;

    /** Bot dev's discord user ID */
    devID: string;

    /** Bot dev's discord guild ID */
    devGuildID: string;


    /** Bot ID */
    botID: string;

    /** Bot token */
    botToken: string;

    /** Bot application key */
    botKey: string;

    /** Discord webhook ID */
    webhookID: string;

    /** Discord webhook token */
    webhookToken: string;


    /** Osu OAuth Client ID */
    osuID: number;

    /** Osu OAuth Client Secret */
    osuSecret: string;


    /** Guild IDs that can use commands */
    commandGuilds: string[];

    /** 5dl config */
    fdl: {
        /** Admins of 5dl */
        admins: string[];
        /** Guild where 5dl is being hosted at */
        guild: string;
    };

    /** Invite tracking config */
    inviteTracking: {
        /** An object mapping guild ids to their log channel id */
        guilds: Record<string, string>;
    };

    /**
     * Rank emotes for use in 5dl, mapping rank to full discord emoji
     * e.g. "X": "<:osuX:867931918543515698>"
     */
    rankEmotes: { [rank in ScoreRank]: string; };
}

const envPath = process.env.CONFIG_PATH ?? "./config.json";
if (!existsSync(envPath))
    throw new Error("Missing config file");

export const Config: Config = {
    debug: process.env.NODE_ENV === "development",
    devID: "",
    devGuildID: "",
    botID: "",
    botToken: "",
    botKey: "",
    webhookID: "",
    webhookToken: "",
    osuID: 0,
    osuSecret: "",

    commandGuilds: [],
    fdl: {
        admins: [],
        guild: ""
    },
    inviteTracking: {
        guilds: {}
    },
    rankEmotes: ScoreRank,

    ...JSON.parse(readFileSync(envPath, "utf8")) as Partial<Config>
};
