import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { SolidUI } from 'bf6-portal-utils/solid-ui/index.ts';

import { UI } from 'bf6-portal-utils/ui/index.ts';
import { UIContainer } from 'bf6-portal-utils/ui/components/container/index.ts';
import { UIText } from 'bf6-portal-utils/ui/components/text/index.ts';
import { UITextButton } from 'bf6-portal-utils/ui/components/text-button/index.ts';
import { UIImage } from 'bf6-portal-utils/ui/components/image/index.ts';

import { SearchAndDestroy } from './index.ts';

export class PlayerUI {
    // TODO: These should come from `SearchAndDestroy`.
    public static readonly ALPHA_UNIT_NAME = 'Alpha';
    public static readonly BRAVO_UNIT_NAME = 'Bravo';

    private static readonly _GREEN = mod.CreateVector(0.49, 0.81, 0.41); // #7DCE68

    private static readonly _FRIENDLY_COLOR_BRIGHT = mod.CreateVector(0.471, 0.949, 1.0); // #78F2FF
    private static readonly _FRIENDLY_COLOR_BACKGROUND = mod.CreateVector(0.471 / 2.5, 0.949 / 2.5, 1.0 / 2.5);
    private static readonly _FRIENDLY_COLOR_DARK = mod.CreateVector(0.416, 0.599, 0.657); // #6A99A8
    private static readonly _ENEMY_COLOR_BRIGHT = mod.CreateVector(0.996, 0.561, 0.443); // #FE8F71
    private static readonly _ENEMY_COLOR_BACKGROUND = mod.CreateVector(0.996 / 2.5, 0.561 / 2.5, 0.443 / 2.5);
    private static readonly _ENEMY_COLOR_DARK = mod.CreateVector(0.749, 0.498, 0.431); // #BF7F6E

    private static readonly _PLAYERS = new Map<number, PlayerUI>();

    private static _logger: Logging;
    private static _gameState: SearchAndDestroy.State;
    private static _gameOptions: SearchAndDestroy.Options;

    public static setLogger(logger: Logging): void {
        this._logger = logger;
    }

    public static setGameState(gameState: SearchAndDestroy.State): void {
        this._gameState = gameState;
    }

    public static setGameOptions(gameOptions: SearchAndDestroy.Options): void {
        this._gameOptions = gameOptions;
    }

    public static handlePlayerJoinGame(player: mod.Player, onSwitchTeamsClick?: () => Promise<void> | void): void {
        const playerId = mod.GetObjId(player);

        if (PlayerUI._logger.willLog(Logging.LogLevel.Debug)) {
            PlayerUI._logger.log(
                `<PUI> P-${playerId} joined game on T-${mod.GetObjId(mod.GetTeam(player))}`,
                Logging.LogLevel.Debug
            );
        }

        if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
            PlayerUI._PLAYERS.set(playerId, new PlayerUI(player, onSwitchTeamsClick));
        }
    }

    public static handlePlayerLeaveGame(playerId: number): void {
        if (PlayerUI._logger.willLog(Logging.LogLevel.Info)) {
            PlayerUI._logger.log(`<PUI> P-${playerId} left game`, Logging.LogLevel.Info);
        }

        PlayerUI.delete(playerId);
    }

    public static delete(playerId: number): void {
        const playerUI = PlayerUI._PLAYERS.get(playerId);

        if (!playerUI) return;

        for (const element of playerUI._gameStartElements) {
            element.delete();
        }

        for (const element of playerUI._roundStartInfoElements) {
            element.delete();
        }

        for (const element of playerUI._roundDeploymentElements) {
            element.delete();
        }

        for (const element of playerUI._roundEndInfoElements) {
            element.delete();
        }

        for (const element of playerUI._gameEndElements) {
            element.delete();
        }

        PlayerUI._PLAYERS.delete(playerUI._playerId);
    }

    public static deleteGameStartUIs(): void {
        for (const playerUI of PlayerUI._PLAYERS.values()) {
            for (const element of playerUI._gameStartElements) {
                element.delete();
            }
        }
    }

    // NOTE: onSwitchTeamsClick should bake in the player.
    private constructor(player: mod.Player, onSwitchTeamsClick?: () => Promise<void> | void) {
        this._player = player;
        this._playerId = mod.GetObjId(player);

        if (!PlayerUI._gameState.currentRoundId) {
            this._createGameStartUI(onSwitchTeamsClick);
        }

        this._createStartRoundInfoUI();
        this._createRoundDeploymentUI();
        this._createScoreUI();
        this._createEndRoundInfoUI();
        this._createGameEndUI();

        if (PlayerUI._logger.willLog(Logging.LogLevel.Info)) {
            PlayerUI._logger.log(`<PUI> UI created for P-${this._playerId}`, Logging.LogLevel.Info);
        }
    }

    private _player: mod.Player;
    private _playerId: number;
    private _gameStartElements: UI.Element[] = [];
    private _roundStartInfoElements: UI.Element[] = [];
    private _roundDeploymentElements: UI.Element[] = [];
    private _scoreElements: UI.Element[] = [];
    private _roundEndInfoElements: UI.Element[] = [];
    private _gameEndElements: UI.Element[] = [];

    private _createGameStartUI(onSwitchTeamsClick?: () => Promise<void> | void): void {
        // NOTE: No ned to memo the messages in here as they will be deleted once the game starts.
        const visible = SolidUI.createMemo(
            () => PlayerUI._gameState.gameStarted && !PlayerUI._gameState.currentRoundId
        );

        const gameMode = SolidUI.h(UIText, {
            x: 155,
            y: 130,
            width: 500,
            height: 30,
            anchor: mod.UIAnchor.TopLeft,
            message: () => mod.Message(mod.stringkeys.searchAndDestroy.gameMode, PlayerUI._gameState.totalRounds),
            textSize: 30,
            textAnchor: mod.UIAnchor.TopLeft,
            textColor: UI.COLORS.BF_GREY_1,
            bgFill: mod.UIBgFill.None,
            visible,
            receiver: this._player,
        });

        this._gameStartElements.push(gameMode);

        const side = SolidUI.h(UIText, {
            x: 69,
            y: 650,
            width: 342,
            height: 70,
            anchor: mod.UIAnchor.BottomRight,
            message: () =>
                PlayerUI._gameState.playerMap[this._playerId] === PlayerUI.ALPHA_UNIT_NAME
                    ? mod.Message(mod.stringkeys.searchAndDestroy.alphaSide)
                    : mod.Message(mod.stringkeys.searchAndDestroy.bravoSide),
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgFill: mod.UIBgFill.None,
            visible,
            receiver: this._player,
        });

        this._gameStartElements.push(side);

        const switchTeamsButton = SolidUI.h(UITextButton, {
            x: 69,
            y: 550,
            width: 342,
            height: 100,
            anchor: mod.UIAnchor.BottomRight,
            message: () => mod.Message(mod.stringkeys.searchAndDestroy.switchTeams, PlayerUI._gameState.clock),
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgColor: UI.COLORS.WHITE,
            bgAlpha: 1,
            bgFill: mod.UIBgFill.OutlineThin,
            enabled: SolidUI.createMemo(() => {
                return (
                    PlayerUI._gameOptions.allowSwitchTeams &&
                    visible() &&
                    PlayerUI._gameState.activePlayers[
                        PlayerUI._gameState.playerMap[this._playerId] === PlayerUI.ALPHA_UNIT_NAME
                            ? PlayerUI.BRAVO_UNIT_NAME
                            : PlayerUI.ALPHA_UNIT_NAME
                    ] < 8
                );
            }),
            uiInputModeWhenVisible: true,
            visible: () => PlayerUI._gameOptions.allowSwitchTeams && visible(),
            onClick: onSwitchTeamsClick,
            receiver: this._player,
        });

        this._gameStartElements.push(switchTeamsButton);
    }

    private _createStartRoundInfoUI(): void {
        const isAttacking = SolidUI.createMemo(() => {
            if (!PlayerUI._gameState.currentRoundId || !PlayerUI._gameState.attackingUnitName) return false;

            const unitName = PlayerUI._gameState.playerMap[this._playerId];

            if (!unitName) return false;

            return PlayerUI._gameState.attackingUnitName === unitName;
        });

        const container = SolidUI.h(UIContainer, {
            width: 1000,
            height: 550,
            bgFill: mod.UIBgFill.None,
            visible: SolidUI.createMemo(
                () =>
                    PlayerUI._gameState.gameStarted &&
                    PlayerUI._gameState.currentRoundId > 0 &&
                    !PlayerUI._gameState.roundStarted
            ),
            receiver: this._player,
        });

        new UIContainer({
            parent: container,
            width: 500,
            height: 300,
            anchor: mod.UIAnchor.TopLeft,
            bgColor: PlayerUI._FRIENDLY_COLOR_DARK,
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientRight,
        });

        new UIContainer({
            parent: container,
            width: 500,
            height: 300,
            anchor: mod.UIAnchor.TopRight,
            bgColor: PlayerUI._FRIENDLY_COLOR_DARK,
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientLeft,
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 20,
            width: 1000,
            height: 160,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 160,
            textColor: PlayerUI._FRIENDLY_COLOR_BRIGHT,
            bgFill: mod.UIBgFill.None,
            message: () => mod.Message(mod.stringkeys.searchAndDestroy.round, PlayerUI._gameState.currentRoundId),
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 200,
            width: 1000,
            height: 80,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 80,
            textColor: PlayerUI._FRIENDLY_COLOR_BRIGHT,
            bgFill: mod.UIBgFill.None,
            message: () =>
                mod.Message(
                    isAttacking()
                        ? mod.stringkeys.searchAndDestroy.attacking
                        : mod.stringkeys.searchAndDestroy.defending
                ),
        });

        new UIContainer({
            parent: container,
            y: 350,
            width: 500,
            height: 100,
            anchor: mod.UIAnchor.TopLeft,
            bgColor: UI.COLORS.BF_GREY_3,
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientRight,
        });

        new UIContainer({
            parent: container,
            y: 350,
            width: 500,
            height: 100,
            anchor: mod.UIAnchor.TopRight,
            bgColor: UI.COLORS.BF_GREY_3,
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientLeft,
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 350,
            width: 1000,
            height: 50,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgFill: mod.UIBgFill.None,
            message: () =>
                mod.Message(
                    isAttacking()
                        ? mod.stringkeys.searchAndDestroy.attackingDescription
                        : mod.stringkeys.searchAndDestroy.defendingDescription
                ),
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 400,
            width: 1000,
            height: 50,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgFill: mod.UIBgFill.None,
            message: () =>
                mod.Message(mod.stringkeys.searchAndDestroy.threshold, Math.ceil(PlayerUI._gameState.totalRounds / 2)),
        });

        this._roundEndInfoElements.push(container);
    }

    private _createRoundDeploymentUI(): void {
        const visible = SolidUI.createMemo(
            () => PlayerUI._gameState.roundStarted && !PlayerUI._gameState.roundDeploymentReleased
        );

        const countdown = SolidUI.h(UIText, {
            x: 69,
            y: 550,
            width: 342,
            height: 100,
            anchor: mod.UIAnchor.BottomRight,
            message: () =>
                mod.Message(
                    mod.stringkeys.searchAndDestroy.roundDeploymentCountdown,
                    visible() ? PlayerUI._gameState.clock : 0
                ),
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgColor: UI.COLORS.WHITE,
            bgAlpha: 1,
            bgFill: mod.UIBgFill.OutlineThin,
            visible,
            receiver: this._player,
        });

        this._roundDeploymentElements.push(countdown);
    }

    private _createTeamSquare(parent: UIContainer, unitName: string): void {
        const isOnLeft = SolidUI.createMemo(() => {
            const playerUnitName = PlayerUI._gameState.playerMap[this._playerId];

            if (!playerUnitName) return false;

            return playerUnitName === unitName;
        });

        const color = () => (isOnLeft() ? PlayerUI._FRIENDLY_COLOR_BRIGHT : PlayerUI._ENEMY_COLOR_BRIGHT);
        const background = () => (isOnLeft() ? PlayerUI._FRIENDLY_COLOR_BACKGROUND : PlayerUI._ENEMY_COLOR_BACKGROUND);

        const container = SolidUI.h(UIContainer, {
            parent,
            x: () => (isOnLeft() ? -25 : 25),
            y: 34,
            width: 46,
            height: 70,
            anchor: mod.UIAnchor.TopCenter,
            bgColor: background,
            bgAlpha: 0.85,
            bgFill: mod.UIBgFill.Solid,
        });

        SolidUI.h(UIContainer, {
            parent: container,
            width: 46,
            height: 70,
            bgColor: color,
            bgAlpha: 1,
            bgFill: mod.UIBgFill.OutlineThin,
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 8,
            width: 46,
            height: 30,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 24,
            textColor: color,
            bgFill: mod.UIBgFill.None,
            message: () => mod.Message(PlayerUI._gameState.scores[unitName]),
        });

        SolidUI.h(UIImage, {
            parent: container,
            x: 8,
            y: 8,
            width: 10,
            height: 18,
            anchor: () => (isOnLeft() ? mod.UIAnchor.BottomLeft : mod.UIAnchor.BottomRight),
            imageType: mod.UIImageType.CrownSolid,
            imageColor: color,
            bgFill: mod.UIBgFill.None,
        });

        SolidUI.h(UIText, {
            parent: container,
            x: 4,
            y: 8,
            width: 22,
            height: 18,
            anchor: () => (isOnLeft() ? mod.UIAnchor.BottomRight : mod.UIAnchor.BottomLeft),
            textSize: 16,
            textColor: color,
            bgFill: mod.UIBgFill.None,
            message: () => mod.Message(PlayerUI._gameState.activePlayers[unitName]),
        });
    }

    private _createScoreUI(): void {
        const container = SolidUI.h(UIContainer, {
            y: 80,
            width: 600,
            height: 104,
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.None,
            visible: SolidUI.createMemo(() => PlayerUI._gameState.gameStarted && !PlayerUI._gameState.gameEnded),
            receiver: this._player,
        });

        const clockContainer = new UIContainer({
            parent: container,
            width: 96,
            height: 30,
            anchor: mod.UIAnchor.TopCenter,
            bgColor: UI.COLORS.BF_GREY_4,
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.Solid,
        });

        const isInDeploymentScreen = SolidUI.createMemo(() => !PlayerUI._gameState.roundDeploymentReleased);
        const isObjectiveArmed = SolidUI.createMemo(
            () => !PlayerUI._gameState.roundEnded && PlayerUI._gameState.objectiveArmed
        );

        SolidUI.h(UIText, {
            parent: clockContainer,
            width: 96,
            height: 30,
            textSize: 18,
            textColor: () =>
                isInDeploymentScreen()
                    ? PlayerUI._GREEN
                    : isObjectiveArmed()
                      ? PlayerUI._ENEMY_COLOR_BRIGHT
                      : UI.COLORS.WHITE,
            bgColor: () =>
                isInDeploymentScreen()
                    ? PlayerUI._GREEN
                    : isObjectiveArmed()
                      ? PlayerUI._ENEMY_COLOR_BRIGHT
                      : UI.COLORS.WHITE,
            bgAlpha: 1,
            bgFill: mod.UIBgFill.OutlineThin,
            message: () => {
                const seconds = PlayerUI._gameState.clock % 60;

                return mod.Message(
                    mod.stringkeys.searchAndDestroy.clock,
                    Math.floor(PlayerUI._gameState.clock / 60),
                    Math.floor(seconds / 10),
                    seconds % 10
                );
            },
        });

        this._createTeamSquare(container, PlayerUI.ALPHA_UNIT_NAME);
        this._createTeamSquare(container, PlayerUI.BRAVO_UNIT_NAME);

        this._scoreElements.push(container);
    }

    private _createEndRoundInfoUI(): void {
        const visible = SolidUI.createMemo(
            () =>
                PlayerUI._gameState.roundEnded &&
                !PlayerUI._gameState.gameEnded &&
                PlayerUI._gameState.winningUnitName !== undefined &&
                !PlayerUI._gameState.resetting
        );

        const isWinner = SolidUI.createMemo(() => {
            if (!visible()) return false;

            const unitName = PlayerUI._gameState.playerMap[this._playerId];

            if (!unitName) return false;

            // visible() ensures that PlayerUI._gameState.winningUnitName is not undefined.
            return PlayerUI._gameState.winningUnitName === unitName;
        });

        const container = SolidUI.h(UIContainer, {
            width: 1920,
            height: 500,
            bgFill: mod.UIBgFill.None,
            visible,
            receiver: this._player,
        });

        SolidUI.h(UIContainer, {
            parent: container,
            width: 960,
            height: 300,
            anchor: mod.UIAnchor.TopLeft,
            bgColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_DARK : PlayerUI._ENEMY_COLOR_DARK),
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientRight,
        });

        SolidUI.h(UIContainer, {
            parent: container,
            width: 960,
            height: 300,
            anchor: mod.UIAnchor.TopRight,
            bgColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_DARK : PlayerUI._ENEMY_COLOR_DARK),
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientLeft,
        });

        SolidUI.h(UIText, {
            parent: container,
            width: 1920,
            height: 300,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 240,
            textColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_BRIGHT : PlayerUI._ENEMY_COLOR_BRIGHT),
            bgFill: mod.UIBgFill.None,
            message: () =>
                mod.Message(
                    isWinner() ? mod.stringkeys.searchAndDestroy.roundWon : mod.stringkeys.searchAndDestroy.roundLost
                ),
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 300,
            width: 1920,
            height: 100,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 40,
            textColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_BRIGHT : PlayerUI._ENEMY_COLOR_BRIGHT),
            bgFill: mod.UIBgFill.None,
            message: () =>
                mod.Message(
                    isWinner()
                        ? mod.stringkeys.searchAndDestroy.winReasons[
                              PlayerUI._gameState.winCondition ?? 'enemiesEliminated'
                          ]
                        : mod.stringkeys.searchAndDestroy.loseReasons[
                              PlayerUI._gameState.winCondition ?? 'enemiesEliminated'
                          ]
                ),
        });

        this._roundEndInfoElements.push(container);

        const nextRoundCountdownVisible = SolidUI.createMemo(() => {
            if (!visible()) return false;

            // visible() ensures that PlayerUI._gameState.winningUnitName is not undefined.
            return (
                PlayerUI._gameState.scores[PlayerUI._gameState.winningUnitName!] <
                Math.ceil(PlayerUI._gameState.totalRounds / 2)
            );
        });

        const nextRoundCountdown = SolidUI.h(UIText, {
            width: 2520,
            height: 60,
            anchor: mod.UIAnchor.BottomCenter,
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgColor: UI.COLORS.BF_GREY_4,
            bgAlpha: 0.8,
            bgFill: mod.UIBgFill.Blur,
            visible: nextRoundCountdownVisible,
            message: () =>
                mod.Message(
                    mod.stringkeys.searchAndDestroy.nextRoundCountdown,
                    PlayerUI._gameState.currentRoundId + 1,
                    PlayerUI._gameState.totalRounds,
                    PlayerUI._gameState.clock
                ),
            receiver: this._player,
        });

        this._roundEndInfoElements.push(nextRoundCountdown);
    }

    private _createGameEndUI(): void {
        const visible = SolidUI.createMemo(
            () => PlayerUI._gameState.gameEnded && PlayerUI._gameState.winningUnitName !== undefined
        );

        const isWinner = SolidUI.createMemo(() => {
            if (!visible()) return false;

            const unitName = PlayerUI._gameState.playerMap[this._playerId];

            if (!unitName) return false;

            // visible() ensures that PlayerUI._gameState.winningUnitName is not undefined.
            return PlayerUI._gameState.winningUnitName === unitName;
        });

        const container = SolidUI.h(UIContainer, {
            width: 1920,
            height: 500,
            bgFill: mod.UIBgFill.None,
            visible,
            receiver: this._player,
        });

        SolidUI.h(UIContainer, {
            parent: container,
            width: 960,
            height: 300,
            anchor: mod.UIAnchor.TopLeft,
            bgColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_DARK : PlayerUI._ENEMY_COLOR_DARK),
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientRight,
        });

        SolidUI.h(UIContainer, {
            parent: container,
            width: 960,
            height: 300,
            anchor: mod.UIAnchor.TopRight,
            bgColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_DARK : PlayerUI._ENEMY_COLOR_DARK),
            bgAlpha: 0.9,
            bgFill: mod.UIBgFill.GradientLeft,
        });

        SolidUI.h(UIText, {
            parent: container,
            width: 1920,
            height: 300,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 240,
            textColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_BRIGHT : PlayerUI._ENEMY_COLOR_BRIGHT),
            bgFill: mod.UIBgFill.None,
            message: () =>
                mod.Message(
                    isWinner() ? mod.stringkeys.searchAndDestroy.victory : mod.stringkeys.searchAndDestroy.defeat
                ),
        });

        SolidUI.h(UIText, {
            parent: container,
            y: 300,
            width: 1920,
            height: 100,
            anchor: mod.UIAnchor.TopCenter,
            textSize: 40,
            textColor: () => (isWinner() ? PlayerUI._FRIENDLY_COLOR_BRIGHT : PlayerUI._ENEMY_COLOR_BRIGHT),
            bgFill: mod.UIBgFill.None,
            message: () => {
                // visible() ensures that PlayerUI._gameState.winningUnitName is not undefined.
                const score = visible() ? PlayerUI._gameState.scores[PlayerUI._gameState.winningUnitName!] : 0;

                return mod.Message(
                    isWinner()
                        ? mod.stringkeys.searchAndDestroy.victoryReason
                        : mod.stringkeys.searchAndDestroy.defeatReason,
                    score
                );
            },
        });

        this._gameEndElements.push(container);

        const gameEndCountdown = SolidUI.h(UIText, {
            width: 2520,
            height: 60,
            anchor: mod.UIAnchor.BottomCenter,
            textSize: 30,
            textColor: UI.COLORS.WHITE,
            bgColor: UI.COLORS.BF_GREY_4,
            bgAlpha: 0.8,
            bgFill: mod.UIBgFill.Blur,
            visible,
            message: () =>
                mod.Message(
                    mod.stringkeys.searchAndDestroy.gameEndCountdown,
                    visible() ? PlayerUI._gameState.clock : 0
                ),
            receiver: this._player,
        });

        this._gameEndElements.push(gameEndCountdown);
    }
}
