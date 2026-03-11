// TODO: This is coupling, make win condition type on GameState.
import { Round } from './round.ts';

import { SearchAndDestroy } from './index.ts';

export class VoiceOvers {
    private static readonly _ALPHA_UNIT_NAME = 'Alpha';
    private static readonly _BRAVO_UNIT_NAME = 'Bravo';

    public constructor(gameState: SearchAndDestroy.State, gameOptions: SearchAndDestroy.Options) {
        this._gameState = gameState;
        this._gameOptions = gameOptions;

        this._voiceOverModules[VoiceOvers._ALPHA_UNIT_NAME] = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, 0, 0)
        ) as mod.VO;

        this._voiceOverModules[VoiceOvers._BRAVO_UNIT_NAME] = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, 0, 0)
        ) as mod.VO;
    }

    private readonly _voiceOverModules: Record<string, mod.VO> = {};

    private _gameState: SearchAndDestroy.State;
    private _gameOptions: SearchAndDestroy.Options;

    private _checkTimeLeftForVoiceOver(seconds: number, targetSeconds: number): boolean {
        return (
            seconds === targetSeconds &&
            (!this._gameState.objectiveArmed || this._gameOptions.objectiveFuseDuration !== seconds)
        );
    }

    private _getVoiceOverTimeEvent(seconds: number): mod.VoiceOverEvents2D | undefined {
        if (this._checkTimeLeftForVoiceOver(seconds, 120)) return mod.VoiceOverEvents2D.Time120Left;
        if (this._checkTimeLeftForVoiceOver(seconds, 60)) return mod.VoiceOverEvents2D.Time60Left;
        if (this._checkTimeLeftForVoiceOver(seconds, 30)) return mod.VoiceOverEvents2D.Time30Left;
        return undefined;
    }

    private _playVoiceOver(unitName: string, voiceOverEvent: mod.VoiceOverEvents2D): void {
        const voiceOverModule = this._voiceOverModules[unitName];

        if (!voiceOverModule) return;

        mod.PlayVO(
            voiceOverModule,
            voiceOverEvent,
            mod.VoiceOverFlags.Alpha,
            mod.GetTeam(this._gameState.teamIds[unitName])
        );
    }

    private _playVoiceOvers(voiceOverEvent?: mod.VoiceOverEvents2D): void {
        if (!voiceOverEvent) return;

        this._playVoiceOver(VoiceOvers._ALPHA_UNIT_NAME, voiceOverEvent);
        this._playVoiceOver(VoiceOvers._BRAVO_UNIT_NAME, voiceOverEvent);
    }

    public playTimeLeftVoiceOvers(seconds: number): void {
        if (!this._gameState.roundDeploymentReleased) return;

        if (!this._gameState.attackingUnitName || !this._gameState.defendingUnitName) return;

        if (seconds === 20) {
            if (this._gameState.objectiveArmed) {
                this._playVoiceOver(this._gameState.defendingUnitName, mod.VoiceOverEvents2D.TimeLow);
            } else {
                this._playVoiceOver(this._gameState.attackingUnitName, mod.VoiceOverEvents2D.TimeLow);
            }

            return;
        }

        this._playVoiceOvers(this._getVoiceOverTimeEvent(seconds));
    }

    public playRoundStartVoiceOvers(): void {
        this._playVoiceOvers(mod.VoiceOverEvents2D.RoundStartGeneric);
    }

    public playSwitchSidesVoiceOvers(): void {
        this._playVoiceOvers(mod.VoiceOverEvents2D.RoundSwitchSides);
    }

    public playLastRoundVoiceOvers(): void {
        this._playVoiceOvers(mod.VoiceOverEvents2D.RoundLastRound);
    }

    public playGameEndVoiceOvers(): void {
        if (!this._gameState.winningUnitName) return;

        const losingTeamName =
            this._gameState.winningUnitName === VoiceOvers._ALPHA_UNIT_NAME
                ? VoiceOvers._BRAVO_UNIT_NAME
                : VoiceOvers._ALPHA_UNIT_NAME;

        this._playVoiceOver(this._gameState.winningUnitName, mod.VoiceOverEvents2D.GlobalEOMVictory);
        this._playVoiceOver(losingTeamName, mod.VoiceOverEvents2D.GlobalEOMDefeat);
    }

    public playPlayerCountLowVoiceOvers(unitNameWithLowPlayerCount: string): void {
        const otherUnitName =
            unitNameWithLowPlayerCount === VoiceOvers._ALPHA_UNIT_NAME
                ? VoiceOvers._BRAVO_UNIT_NAME
                : VoiceOvers._ALPHA_UNIT_NAME;

        this._playVoiceOver(unitNameWithLowPlayerCount, mod.VoiceOverEvents2D.PlayerCountFriendlyLow);
        this._playVoiceOver(otherUnitName, mod.VoiceOverEvents2D.PlayerCountEnemyLow);
    }

    public playMCOMArmedVoiceOvers(): void {
        if (!this._gameState.attackingUnitName || !this._gameState.defendingUnitName) return;

        this._playVoiceOver(this._gameState.attackingUnitName, mod.VoiceOverEvents2D.MComArmFriendly);
        this._playVoiceOver(this._gameState.defendingUnitName, mod.VoiceOverEvents2D.MComArmEnemy);
    }

    public playRoundEndVoiceOvers(): void {
        if (!this._gameState.winningUnitName || !this._gameState.winCondition) return;

        const losingUnitName =
            this._gameState.winningUnitName === VoiceOvers._ALPHA_UNIT_NAME
                ? VoiceOvers._BRAVO_UNIT_NAME
                : VoiceOvers._ALPHA_UNIT_NAME;

        if (this._gameState.winCondition === Round.WinCondition.EnemyEliminated) {
            this._playVoiceOver(this._gameState.winningUnitName, mod.VoiceOverEvents2D.RoundEndFriendlyKills);
            this._playVoiceOver(losingUnitName, mod.VoiceOverEvents2D.RoundEndEnemyKills);
        } else if (this._gameState.winCondition === Round.WinCondition.ObjectiveDestroyed) {
            this._playVoiceOver(this._gameState.winningUnitName, mod.VoiceOverEvents2D.MComDestroyedFriendly);
            this._playVoiceOver(losingUnitName, mod.VoiceOverEvents2D.MComDestroyedEnemy);
        } else if (this._gameState.winCondition === Round.WinCondition.ObjectiveDisarmed) {
            this._playVoiceOver(this._gameState.winningUnitName, mod.VoiceOverEvents2D.MComDefuseFriendly);
            this._playVoiceOver(losingUnitName, mod.VoiceOverEvents2D.MComDefuseEnemy);
        } else if (this._gameState.winCondition === Round.WinCondition.ObjectivesDefended) {
            this._playVoiceOver(this._gameState.winningUnitName, mod.VoiceOverEvents2D.RoundEndFriendlyCapture);
            this._playVoiceOver(losingUnitName, mod.VoiceOverEvents2D.RoundEndEnemyCapture);
        }
    }
}
