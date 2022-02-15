import { EventEmitter } from "events";
import * as path from "path";
import {
    BeatmapLeaderboardScope,
    Gamemode,
    Ramune,
    RequestNetworkError,
    RequestHandler,
    RequestType,
    ScoreType
} from "ramune";
import type { Score as RamuneScore } from "ramune/lib/Responses";
import { MessageEmbedOptions } from "slash-create";

import { Blob } from "../Blob";
import { ConfigStore } from "./Stores/ConfigStore";
import { asyncMap } from "../Utils/Helpers";
import { Component, ComponentLoad, Dependency } from "../Utils/DependencyInjection";
import { Logger } from "../Utils/Logger";
import { Database } from "./Database";
import { Score } from "../Database/Entities/Score";
import { User } from "../Database/Entities/User";
import { Map } from "../Database/Entities/Map";
import { EntityManager } from "@mikro-orm/core";
import { Collection } from "../Utils/Collection";
import { mkdir, writeFile } from "fs/promises";

export interface TrackerEvents<T> {
    (event: "newScore", listener: (score: RamuneScore) => void): T;
}
export interface LeagueTracker {
    on: TrackerEvents<this>;
    once: TrackerEvents<this>;
}
@Component("Tracker/League")
export class LeagueTracker extends EventEmitter implements Component {
    private readonly logger = new Logger("Tracker/League");

    @Dependency private readonly config!: ConfigStore;
    @Dependency private readonly database!: Database;
    @Dependency private readonly ramune!: Ramune;

    private trackTimer?: NodeJS.Timer;
    private readonly requestHandler = new RequestHandler({
        defaultHost: "discord.com",
        rateLimit: {
            limit: 3,
            interval: 3e3
        }
    });
    private readonly webhook = {
        id: Blob.Environment.webhookID,
        token: Blob.Environment.webhookToken
    };

    @ComponentLoad
    async load() {
        if (this.trackTimer)
            clearInterval(this.trackTimer);

        this.trackTimer = setInterval(this.refresh.bind(this), 60e3);
        const em = this.database.getManager();
        await this.syncScores(em);
        await this.updateScores(em);
        await em.flush();
    }

    public async syncScores(em: EntityManager) {
        const maps = await em.find(Map, {}, { populate: ["league.players"] });
        const scores = await asyncMap(maps, async map => {
            if (!map.scoreable) return [];

            const res = await asyncMap(map.league.players.getItems(), async player => {
                try {
                    return (await this.ramune.getBeatmapUserScore(
                        map.id.toString(),
                        player.id.toString(),
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

                    this.logger.error(`Failed fetching scores of ${player.id} during sync`, error);
                    return;
                }
            });

            const filtered = res
                .filter((score): score is RamuneScore => score !== undefined)
                .sort((a, b) => b.score - a.score);

            return filtered;
        });

        await this.processMany(scores.flat(1), false, em);
        return;
    }

    public async updateScores(em: EntityManager) {
        this.logger.info("Checking for lost scores");
        const lostScores: RamuneScore[] = [];
        const players = await em.find(User, {});
        await asyncMap(players, async player => {
            const cursor = this.ramune.getUserScores(player.id, ScoreType.Recent, Gamemode.Osu);
            let update: number | undefined;
            for await (const score of cursor.iterate(20)) {
                if (score.id === player.lastPlayID)
                    break;

                update ??= score.id;
                lostScores.push(score);
            }
            if (update)
                // not immediately flushed but it will be
                player.lastPlayID = update;
        });
        if (!lostScores.length) {
            this.logger.info("No scores to recover");
            return;
        }
        this.logger.info(`Recovering ${lostScores.length} lost scores`);

        await this.processMany(lostScores, true, em);
    }

    private async refresh() {
        const em = this.database.getManager();
        const players = await em.find(User, {});
        const res = await asyncMap(players, async player => await this.refreshPlayer(player, false, em));
        const scores = res
            .flat(1)
            .sort((a, b) => a.id - b.id);

        await this.backup(scores);
        await this.processMany(scores, true, em);
        await em.flush();
    }

    public async refreshPlayer(player: User, shouldProcess: boolean = true, em?: EntityManager) {
        const scores: RamuneScore[] = [];

        try {
            const cursor = this.ramune.getUserScores(player.id, ScoreType.Recent, Gamemode.Osu);
            for await (const score of cursor.iterate(1)) {
                if (score.id === player.lastPlayID)
                    break;

                scores.push(score);
            }
            if (scores.length)
                // not immediately flushed but it will be
                player.lastPlayID = scores[0].id;
        } catch(e) {
            this.logger.error("Error getting user scores", player, e);
            return [];
        }

        await this.backup(scores);
        if (shouldProcess)
            await asyncMap(scores, async score => await this.process(score, true, em));

        return scores;
    }

    public async processMany(scores: RamuneScore[], shouldPost: boolean = true, sharedEM?: EntityManager) {
        if (!scores.length)
            return;
        const em = sharedEM ?? this.database.getManager();

        const userIDs = [...new Set(scores.map(score => score.user_id))];
        const users = await em.find(User, userIDs);
        if (!users.length)
            return;

        const mapIDs = [...new Set(scores.map(score => score.beatmap!.id))];
        const maps = await em.find(Map, mapIDs);
        if (!maps.length)
            return;

        const ret: Collection<number, Collection<number, RamuneScore>> = new Collection();
        scores
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .forEach(score => {
                const user = users.find(u => u.id === score.user_id);
                const map = maps.find(m => m.id === score.beatmap!.id);
                if (!user || !map)
                    return;
                if (user.league.name !== map.league.name)
                    return;

                const coll = ret.getOrSet(score.beatmap!.id, new Collection());
                const prev = coll.getOrSet(score.user_id, score);
                if (score.score > prev.score)
                    coll.set(score.user_id, score);
            });

        const orMap: { map: number; user: number }[] = [];
        ret.forEach((coll, map) => {
            coll.forEach((_, user) => {
                orMap.push({ map, user });
            });
        });
        if (orMap.length === 0)
            return;

        const postQueue: Score[] | undefined = shouldPost ? [] : undefined;

        const previousScores = (await em.find(Score, { $or: orMap })).sort((a, b) => b.score - a.score);
        const filtered = ret.map(coll => coll.valuesAsArray()).flat(1);
        filtered.forEach(score => {
            const prev = previousScores.find(ps => ps.user?.id === score.user_id && ps.map?.id === score.beatmap!.id);
            if (prev && prev.score >= score.score)
                return;

            const newScore = new Score(score);
            newScore.map = maps.find(m => m.id === score.beatmap!.id)!;
            newScore.user = users.find(u => u.id === score.user_id)!;
            if (!newScore.testMods())
                return;

            em.persist(newScore);
            postQueue?.push(newScore);
        });

        if (!sharedEM)
            await em.flush();

        if (postQueue)
            for (const score of postQueue)
                await this.post(score);
    }

    public async process(rawScore: RamuneScore, shouldPost: boolean = true, sharedEM?: EntityManager) {
        this.emit("newScore", rawScore);

        const em = sharedEM ?? this.database.getManager();
        const user = await em.findOne(User, rawScore.user_id);
        if (!user)
            return this.logger.error(`Attempted to process a user not in database (user: ${rawScore.user_id}, score: ${rawScore.id})`);

        const map = await em.findOne(Map, rawScore.beatmap!.id);
        if (!map || map.league.name !== user.league.name)
            return;

        const previousScore = await em.findOne(Score, { map: rawScore.beatmap!.id, user });
        if (rawScore.id === previousScore?.id || rawScore.score < previousScore?.score!)
            return;

        const score = new Score(rawScore);
        score.map = map;
        score.user = user;
        if (!score.testMods())
            return;

        if (shouldPost) {
            this.logger.info(`Posting: ${score.id} - ${score.bestID ?? "none"}`);
            this.post(score);
        }
        return;
    }

    /** In case the database goes funky wunky, let's store backups */
    private async backup(scores: RamuneScore[]) {
        await mkdir("./ignore/scores_backup", { recursive: true });
        await asyncMap(scores, async score => {
            const filePath = path.join("./ignore/scores_backup/", score.id.toString() + ".json");
            await writeFile(filePath, JSON.stringify(score), "utf8");
        });
        return;
    }

    private async post(score: Score) {
        const user = score.user!;

        const embed: MessageEmbedOptions = {
            author: {
                name: `${score.map.artist} - ${score.map.title} [${score.map.diff}]` + (score.mods.length ? " +" + score.mods.join("") : ""),
                url: `https://osu.ppy.sh/b/${score.map.id}`
            },
            thumbnail: { url: `https://b.ppy.sh/thumb/${score.map.setID}l.jpg` },
            color: 0x33EB35,
            description: [
                `League = ${score.map.league.name}`,
                `Week = ${score.map.week}`,
                `Map ID = ${score.map.id}`,
                `Required Mods = \`${score.map.modExpression ?? "Freemod"}\``
            ].join("\n"),
            fields: [
                {
                    name: "Score Info",
                    value: [
                        `Score: **${score.score.toLocaleString()}**${score.mods.length ? ` **+${score.mods.join("")}**` : ""}`,
                        `Accuracy: **${Math.round(score.accuracy * 10000) / 100}%**`,
                        `Rank: ${this.config.getRankEmote(score.rank)!} - ${score.count300}/${score.count100}/${score.count50}/${score.countmiss}`,
                        `Combo: **${score.combo}**/${score.map.maxCombo?.toString() ?? "0"}x`,
                        score.bestID ? `[View on osu](https://osu.ppy.sh/scores/osu/${score.bestID})` : undefined
                    ].filter(i => i !== undefined).join("\n")
                }
                // TODO
                // {
                //     name: "Ranking Changes",
                //     value: "None (placeholder)"
                // }
            ],
            timestamp: new Date(score.createdAt)
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
}
