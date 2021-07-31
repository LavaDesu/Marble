import { Score } from "ramune/lib/Responses/Score";
import { BeatmapLeaderboardScope } from "ramune/lib/Enums";
import { Marble } from "../Marble";
import { StoreMap } from "../Store";
import { CachedCollection } from "./CachedCollection";

export class LeagueManager {
    public readonly scoreCache: CachedCollection<number, Score[]>;

    constructor() {
        this.scoreCache = new CachedCollection(1800e3);
    }

    public async getScores(map: StoreMap): Promise<{ cached: boolean; scores: Score[] }> {
        let res = this.scoreCache.get(map.map.id);
        if (res)
            return { cached: true, scores: res };

        const resCountry = (await Marble.Instance.ramuneClient.getBeatmapScores(map.map.id.toString(), {
            mode: "osu",
            // mods: map.mods,
            type: BeatmapLeaderboardScope.Country
        })).scores;
        const resExt = (await Promise.all(
            map.league.players
                .valuesAsArray()
                .filter(p => p.osu.country_code !== "KH")
                .map(async p => {
                    try {
                        return (await Marble.Instance.ramune.getBeatmapUserScore(
                            map.map.id.toString(),
                            p.osu.id.toString(),
                            {
                                mode: "osu",
                                // mods: map.mods,
                                type: BeatmapLeaderboardScope.Global
                            }
                        )).score;
                    } catch (e) {
                        return;
                    }
                })
        )).filter((i): i is Score => i !== undefined);

        res = [...resCountry, ...resExt]
            .filter(score =>
                (map.mods ?? []).every(mod => {
                    if (score.mods.includes("NC") && mod === "DT")
                        return true;
                    return score.mods.includes(mod);
                })
            )
            .sort((a, b) => b.score - a.score);
        this.scoreCache.set(map.map.id, res);
        return { cached: false, scores: res };
    }
}
