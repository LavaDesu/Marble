import { writeFile } from "fs/promises";
import { EventEmitter } from "events";
import { Gamemode, RequestType, ScoreType } from "ramune/lib/Enums";
import { Score } from "ramune/lib/Responses/Score";
import { RequestHandler } from "ramune/lib/RequestHandler";
import { Beatmap } from "ramune/lib/Responses/Beatmap";
import { MessageEmbedOptions } from "slash-create";
import { Marble } from "./Marble";
import { Collection } from "./Util/Collection";
import { StoreMap } from "./Store";

export interface TrackerEvents<T> {
    (event: "newScore", listener: (score: Score) => void): T;
}
export interface Tracker {
    on: TrackerEvents<this>;
    once: TrackerEvents<this>;
}
export class Tracker extends EventEmitter {
    private trackTimer?: NodeJS.Timer;
    private readonly plays: Collection<number, number[]>;
    private readonly requestHandler = new RequestHandler();
    private readonly webhook = {
        id: Marble.Environment.webhookID,
        token: Marble.Environment.webhookToken
    };

    // Collection<PlayerID, Collection<MapID, Score>>
    private readonly scores: Collection<number, Collection<number, Score>>;
    private initialised: boolean;
    private recording: boolean;

    constructor() {
        super();
        this.plays = new Collection();
        this.scores = new Collection();
        this.initialised = false;
        this.recording = Marble.Environment.development;
    }

    async init() {
        if (this.trackTimer)
            clearInterval(this.trackTimer);

        this.trackTimer = setInterval(this.refresh.bind(this), 300000);
        return await this.refresh();
    }

    private async refresh() {
        const queue: Score[] = [];

        await Promise.all(Marble.Instance.store.getPlayers().map(async player => {
            let res: Score[];
            try {
                res = await Marble.Instance.ramune.getUserScores(player.osu.id.toString(), ScoreType.Recent, Gamemode.Osu);
            } catch (e) { return console.log(e); }

            const oldScores = this.plays.getOrSet(player.osu.id, []);
            const newScores = res.filter(score => !oldScores.includes(score.id));
            if (newScores.length)
                queue.push(...newScores);
            this.plays.set(player.osu.id, res.map(i => i.id));
        }));

        if (this.initialised)
            await Promise.all(queue.map(this.process.bind(this)));
        else
            this.initialised = true;
    }

    public async process(score: Score) {
        this.emit("newScore", score);
        console.log(`new: ${score.id}`);

        const map = Marble.Instance.store.getMap(score.beatmap!.id);
        if (!map) return;
        console.log(`mapped: ${score.id}`);
        const beatmap = map.map;

        if (!score.best_id) return;
        console.log(`new best: ${score.id} -> ${score.best_id}`);

        const scores = this.scores.getOrSet(score.user!.id, new Collection());
        const previousScore = scores.get(beatmap.id);
        if (previousScore && previousScore.score < score.score) return;
        console.log(`processing: ${score.id}`);

        if (this.recording)
            await writeFile(`./ignore/score-${score.id}.json`, JSON.stringify(score, undefined, 4));

        scores.set(beatmap.id, score);

        return await this.post(map, score);
    }

    private async post(map: StoreMap, score: Score) {
        const beatmap = map.map;
        const beatmapset = beatmap.beatmapset!;
        const user = score.user!;

        const embed: MessageEmbedOptions = {
            author: {
                name: `${beatmapset.title} [${beatmap.version}]` + (score.mods.length ? " +" + score.mods.join("") : ""),
                url: beatmap.url
            },
            color: 0x33EB35,
            description: [
                `League: ${map.league.name}`,
                `Week: ${map.week.number}`,
                `Map ID: ${beatmap.id}`
            ].join("\n"),
            fields: [
                {
                    name: "Score Info",
                    value: [
                        `Score: ${score.score.toLocaleString()}`,
                        `Accuracy: ${Math.round(score.accuracy * 10000) / 100}%`,
                        `Combo: ${score.max_combo}/${beatmap.max_combo!}x`,
                        `[View on osu](https://osu.ppy.sh/scores/osu/${score.best_id})`
                    ].join("\n")
                },
                {
                    name: "Ranking Changes",
                    value: "None (placeholder)"
                }
            ]
        };
        await this.requestHandler.request({
            host: "discord.com",
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
