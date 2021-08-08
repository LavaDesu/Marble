import { readdir, readFile, writeFile } from "fs/promises";
import { join as joinPaths } from "path";
import { EventEmitter } from "events";
import {
    BeatmapLeaderboardScope,
    Gamemode,
    RequestNetworkError,
    RequestHandler,
    RequestType,
    Score,
    ScoreType
} from "ramune";
import { MessageEmbedOptions } from "slash-create";
import { Marble } from "./Marble";
import { Collection } from "./Util/Collection";
import { Store, StoreMap } from "./Store";
import { asyncForEach, asyncMap } from "./Utils";

export interface TrackerEvents<T> {
    (event: "newScore", listener: (score: Score) => void): T;
}
export interface Tracker {
    on: TrackerEvents<this>;
    once: TrackerEvents<this>;
}
// TODO: rename plays and scores
export class Tracker extends EventEmitter {
    private trackTimer?: NodeJS.Timer;
    /* This collection is used to track scores; it stores all recent plays of a user
     * and used to detect new recent plays
     * format: Collection<PlayerID, ScoreID>
     */
    private readonly plays: Collection<number, number[]>;
    private readonly requestHandler = new RequestHandler({
        defaultHost: "discord.com",
        rateLimit: {
            limit: 5,
            interval: 5e3
        }
    });
    private readonly webhook = {
        id: Marble.Environment.webhookID,
        token: Marble.Environment.webhookToken
    };

    /* This collection is used to track all of the user's top scores per map.
     * format: Collection<MapID, Collection<PlayerID, Score>>
     */
    private readonly scores: Collection<number, Collection<number, Score>>;
    private initialised: boolean;
    private recording: boolean;

    constructor() {
        super();
        this.plays = new Collection();
        this.scores = new Collection();
        this.initialised = false;
        this.recording = true;
    }

    async init() {
        if (this.trackTimer)
            clearInterval(this.trackTimer);

        this.trackTimer = setInterval(this.refresh.bind(this), 60e3);
        await this.syncScores();
        await this.replayScores();
        await this.refresh();
        return;
    }

    public getScore(map: number, player: number) {
        return this.scores.get(map)?.get(player);
    }
    public getMapScores(map: number) {
        return this.scores.get(map);
    }
    public getScores() {
        return this.scores;
    }

    public async replayScores() {
        const scorePaths = await readdir("./scores");
        const scores = await asyncMap(scorePaths, async scorePath =>
            JSON.parse(await readFile(joinPaths("./scores", scorePath), "utf8")) as Score
        );

        /* we're not running this in parallel since we want later scores
         * to override earlier ones, and this could introduce nasty race
         * conditions
         */
        for (const score of scores)
            await this.process(score, false, false);

        return;
    }

    public async syncScores() {
        await Store.Instance.getMaps().asyncMap(async map => {
            if (!map.map.is_scoreable) return;

            const res = await map.league.players
                .asyncMap(async player => {
                    try {
                        return (await Marble.Instance.ramune.getBeatmapUserScore(
                            map.map.id.toString(),
                            player.osu.id.toString(),
                            {
                                mode: "osu",
                                type: BeatmapLeaderboardScope.Global
                            }
                        )).score;
                    } catch (error) {
                        if (
                            error?.type === "network" &&
                            (error as RequestNetworkError).code === 404
                        )
                            return;

                        console.error(`Failed fetching scores of ${player.osu.id} during sync`, error);
                        return;
                    }
                });

            const filtered = res
                .filter((score): score is Score => score !== undefined)
                .sort((a, b) => b.score - a.score);

            await asyncForEach(filtered, async score => await this.process(score, false));
        });
        return;
    }

    private async refresh() {
        const res = await Store.Instance.getPlayers().asyncMap(async player => await this.refreshPlayer(player.osu.id, false));
        const scores = res
            .flat(1)
            .sort((a, b) => a.id - b.id);

        if (this.initialised)
            await Promise.all(scores.map(async score => await this.process(score)));
        else
            this.initialised = true;
    }

    public async refreshPlayer(player: number, shouldProcess: boolean = true) {
        let res: Score[];
        try {
            res = await Marble.Instance.ramune.getUserScores(player.toString(), ScoreType.Recent, Gamemode.Osu);
        } catch (e) {
            console.log(e);
            return [];
        }

        const oldScores = this.plays.getOrSet(player, []);
        const newScores = res.filter(score => !oldScores.includes(score.id));
        this.plays.set(player, res.map(i => i.id));

        if (shouldProcess)
            await asyncMap(newScores, async score => await this.process(score));

        return newScores;
    }

    public async process(score: Score, shouldPost: boolean = true, shouldStore: boolean = true) {
        this.emit("newScore", score);

        if (this.recording && shouldStore)
            await writeFile(`./scores/${score.id}.json`, JSON.stringify(score, undefined, 4));

        // Check 1: Does the map exist in the player's league?
        const league = Store.Instance.getPlayer(score.user_id)?.league;
        const map = Store.Instance.getMap(score.beatmap!.id);
        if (!map || map.league !== league) return;

        // Check 2: Is this score higher than the previous score?
        const scores = this.scores.getOrSet(score.beatmap!.id, new Collection());
        const previousScore = scores.get(score.user_id);
        if (previousScore && previousScore.score > score.score) return;

        // Check 3: Does the score have the necessary mods?
        const neededMods = map.mods ?? [];
        const hasMods = neededMods.every(mod => {
            if (score.mods.includes("NC") && mod === "DT")
                return true;
            return score.mods.includes(mod);
        });
        if (!hasMods) return;

        scores.set(score.user_id, score);

        if (shouldPost) {
            console.log(`Processing: ${score.id} - ${score.best_id}`);
            this.post(map, score);
        }
        return;
    }

    private async post(map: StoreMap, score: Score) {
        const beatmap = map.map;
        const beatmapset = beatmap.beatmapset!;
        const user = score.user!;

        const embed: MessageEmbedOptions = {
            author: {
                name: `${beatmapset.artist} - ${beatmapset.title} [${beatmap.version}]` + (score.mods.length ? " +" + score.mods.join("") : ""),
                url: beatmap.url
            },
            thumbnail: { url: `https://b.ppy.sh/thumb/${beatmapset.id}l.jpg` },
            color: 0x33EB35,
            description: [
                `League = ${map.league.name}`,
                `Week = ${map.week.number}`,
                `Map ID = ${beatmap.id}`,
                `Required Mods = ${map.mods ? map.mods.join() : "None"}`
            ].join("\n"),
            fields: [
                {
                    name: "Score Info",
                    value: [
                        `Score: **${score.score.toLocaleString()}**${score.mods.length ? ` **+${score.mods.join("")}**` : ""}`,
                        `Accuracy: **${Math.round(score.accuracy * 10000) / 100}%**`,
                        `Rank: ${Store.Instance.getRankEmote(score.rank)!} - ${score.statistics.count_300}/${score.statistics.count_100}/${score.statistics.count_50}/${score.statistics.count_miss}`,
                        `Combo: **${score.max_combo}**/${map.map.max_combo!}x`,
                        score.best_id ? `[View on osu](https://osu.ppy.sh/scores/osu/${score.best_id})` : undefined
                    ].filter(i => i !== undefined).join("\n")
                },
                {
                    name: "Ranking Changes",
                    value: "None (placeholder)"
                }
            ],
            timestamp: new Date(score.created_at)
        };
        await this.requestHandler.request({
            discardOutput: true,
            endpoint: `/api/webhooks/${this.webhook.id}/${this.webhook.token}`,
            type: RequestType.POST,
            body: {
                username: score.user!.username,
                avatar_url: `https://s.ppy.sh/a/${user.id}`,
                embeds: [embed]
            }
        });
    }

    public toggleRecord(): boolean {
        return this.recording = !this.recording;
    }
}
