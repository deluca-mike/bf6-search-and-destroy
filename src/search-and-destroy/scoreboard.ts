import { Events } from 'bf6-portal-utils/events/index.ts';

export class Scoreboard {
    private readonly _SCORES: Map<number, Scoreboard.Score> = new Map();

    public constructor() {
        mod.SetScoreboardType(mod.ScoreboardType.CustomTwoTeams);
        mod.SetScoreboardColumnWidths(160, 160, 160);
        mod.SetScoreboardColumnNames(
            mod.Message(mod.stringkeys.searchAndDestroy.scoreboard.columns.kills),
            mod.Message(mod.stringkeys.searchAndDestroy.scoreboard.columns.assists),
            mod.Message(mod.stringkeys.searchAndDestroy.scoreboard.columns.deaths)
        );

        Events.OnPlayerEarnedKill.subscribe((killer: mod.Player, victim: mod.Player) => {
            if (mod.Equals(killer, victim)) return;

            const score = this._getScore(killer);

            score.kills++;

            mod.SetScoreboardPlayerValues(killer, score.kills, score.assists, score.deaths);
        });

        Events.OnPlayerEarnedKillAssist.subscribe((assistingPlayer: mod.Player, victim: mod.Player) => {
            if (mod.Equals(assistingPlayer, victim)) return;

            const score = this._getScore(assistingPlayer);

            score.assists++;

            mod.SetScoreboardPlayerValues(assistingPlayer, score.kills, score.assists, score.deaths);
        });

        Events.OnPlayerDied.subscribe((player: mod.Player) => {
            const score = this._getScore(player);

            score.deaths++;

            mod.SetScoreboardPlayerValues(player, score.kills, score.assists, score.deaths);
        });
    }

    private _getScore(player: mod.Player): Scoreboard.Score {
        const playerId = mod.GetObjId(player);

        if (!this._SCORES.has(playerId)) {
            this._SCORES.set(playerId, { kills: 0, assists: 0, deaths: 0 });
        }

        return this._SCORES.get(playerId)!;
    }
}

export namespace Scoreboard {
    export type Score = {
        kills: number;
        assists: number;
        deaths: number;
    };
}
