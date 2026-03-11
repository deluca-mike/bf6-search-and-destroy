import { Clocks } from 'bf6-portal-utils/clocks/index.ts';
import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { SolidUI } from 'bf6-portal-utils/solid-ui/index.ts';

import { ForceDeploymentManager, SelfDeploymentManager } from './deployment-manager.ts';
import { Objective } from './objective.ts';
import { Soldier } from './soldier.ts';
import { Unit } from './unit.ts';
import { Round } from './round.ts';
import { PlayerUI } from './player-ui.ts';
import { VoiceOvers } from './voice-overs.ts';
import { Scoreboard } from './scoreboard.ts';

export namespace SearchAndDestroy {
    // #region Constants

    const FORCE_DEPLOY = true;
    const ALLOW_SWITCH_TEAMS = true; // true for no revives.
    const ROUND_DELAY_DURATION = 20;
    const ROUNDS_DURATION = 360;
    const OBJECTIVE_FUSE_DURATION = 60;
    const OBJECTIVE_ARM_DURATION = 7;
    const OBJECTIVE_DEFUSE_DURATION = 10;
    const GAME_START_INFO_DURATION = 30;
    const ROUND_START_INFO_DURATION = 10;
    const ROUND_END_INFO_DURATION = 10;
    const GAME_END_INFO_DURATION = 10;
    const MAX_PLAYERS_PER_UNIT = 8;

    // #endregion

    // #region Logging

    const logger = new Logging('SND');

    Objective.setLogger(logger);
    Soldier.setLogger(logger);
    Unit.setLogger(logger);
    Round.setLogger(logger);
    PlayerUI.setLogger(logger);

    export const LogLevel = Logging.LogLevel;

    export function setLogging(
        log?: (text: string) => Promise<void> | void,
        logLevel?: Logging.LogLevel,
        includeError?: boolean
    ): void {
        logger.setLogging(log, logLevel, includeError);
    }

    // #endregion

    // #region Game State

    export type RoundObjectives = Round.ObjectivePositions;

    export type Options = {
        roundObjectives: RoundObjectives[];
        allowSwitchTeams?: boolean;
        delayDuration?: number;
        roundDuration?: number;
        objectiveArmDuration?: number;
        objectiveDefuseDuration?: number;
        objectiveFuseDuration?: number;
    };

    const ALPHA_UNIT = new Unit('Alpha', 1, {
        onSoldierStateChange: (soldier: Soldier): void => handleSoldierStateChange(ALPHA_UNIT, soldier),
    });

    const BRAVO_UNIT = new Unit('Bravo', 2, {
        onSoldierStateChange: (soldier: Soldier): void => handleSoldierStateChange(BRAVO_UNIT, soldier),
    });

    const gameOptions: Options = {
        allowSwitchTeams: ALLOW_SWITCH_TEAMS,
        roundObjectives: [],
        delayDuration: ROUND_DELAY_DURATION,
        roundDuration: ROUNDS_DURATION,
        objectiveArmDuration: OBJECTIVE_ARM_DURATION,
        objectiveDefuseDuration: OBJECTIVE_DEFUSE_DURATION,
        objectiveFuseDuration: OBJECTIVE_FUSE_DURATION,
    };

    export type State = {
        gameStarted: boolean;
        attackingUnitName?: string;
        defendingUnitName?: string;
        roundStarted: boolean;
        roundDeploymentReleased: boolean;
        roundEnded: boolean;
        gameEnded: boolean;
        resetting: boolean;
        objectiveArmed: boolean;
        winningUnitName?: string;
        winCondition?: Round.WinCondition;
        clock: number;
        currentRoundId: number;
        totalRounds: number;
        scores: Record<string, number>;
        activePlayers: Record<string, number>;
        playerMap: Record<number, string | undefined>;
        teamIds: Record<string, number>;
    };

    const [gameState, setGameState] = SolidUI.createStore<State>({
        gameStarted: false,
        attackingUnitName: undefined,
        defendingUnitName: undefined,
        roundStarted: false,
        roundDeploymentReleased: false,
        roundEnded: false,
        gameEnded: false,
        resetting: false,
        objectiveArmed: false,
        winningUnitName: undefined,
        winCondition: undefined,
        clock: 0,
        currentRoundId: 0,
        totalRounds: 0,
        scores: {
            [ALPHA_UNIT.name]: 0,
            [BRAVO_UNIT.name]: 0,
        },
        activePlayers: {
            [ALPHA_UNIT.name]: 0,
            [BRAVO_UNIT.name]: 0,
        },
        playerMap: {},
        teamIds: {
            [ALPHA_UNIT.name]: ALPHA_UNIT.teamId,
            [BRAVO_UNIT.name]: BRAVO_UNIT.teamId,
        },
    });

    PlayerUI.setGameState(gameState);
    PlayerUI.setGameOptions(gameOptions);

    const deploymentManager = FORCE_DEPLOY ? new ForceDeploymentManager(logger) : new SelfDeploymentManager(logger);

    let voiceOvers: VoiceOvers;

    // #endregion

    // #region Handler Functions

    function handleSoldierStateChange(unit: Unit, soldier: Soldier): void {
        if (soldier.state === Soldier.State.Joined) {
            setGameState((s) => {
                s.playerMap[soldier.playerId] = unit.name;
            });

            return Round.handleSoldierJoined(soldier);
        }

        if (soldier.state === Soldier.State.Left) {
            setGameState((s) => {
                s.playerMap[soldier.playerId] = undefined; // TODO: replace with `delete` when new version of SolidUI is released.
            });
        }

        if (soldier.state === Soldier.State.Left || soldier.state === Soldier.State.Undeployed) {
            Round.currentRound?.handleSoldierEliminated(soldier);

            if (unit.activeSoldiers.length === 2) {
                voiceOvers.playPlayerCountLowVoiceOvers(unit.name);
            }
        }

        setGameState((s) => {
            s.activePlayers[unit.name] = unit.activeSoldiers.length;
        });
    }

    function switchUnit(player: mod.Player): void {
        const soldier = Soldier.getSoldier(player);

        if (!soldier) return;

        const unit = soldier.unit === ALPHA_UNIT ? BRAVO_UNIT : ALPHA_UNIT;

        if (!Unit.switchUnit(soldier, unit)) return;

        setGameState((s) => {
            s.playerMap[soldier.playerId] = unit.name;
            s.activePlayers[ALPHA_UNIT.name] = ALPHA_UNIT.activeSoldiers.length;
            s.activePlayers[BRAVO_UNIT.name] = BRAVO_UNIT.activeSoldiers.length;
        });
    }

    function updateClock(seconds: number): void {
        setGameState((s) => {
            s.clock = seconds;
        });

        voiceOvers.playTimeLeftVoiceOvers(seconds);
    }

    // #endregion

    // #region Game Functions

    export function start(options: Options): void {
        if (gameState.gameStarted) return;

        if (options.roundObjectives.length === 0) {
            logger.log(`No objectives provided`, LogLevel.Warning);
            return;
        }

        if (options.roundObjectives.length % 2 === 0) {
            logger.log(`Only odd number of objectives are supported`, LogLevel.Warning);
            return;
        }

        gameOptions.allowSwitchTeams = options.allowSwitchTeams ?? ALLOW_SWITCH_TEAMS;
        gameOptions.roundObjectives = options.roundObjectives;
        gameOptions.delayDuration = options.delayDuration ?? ROUND_DELAY_DURATION;
        gameOptions.roundDuration = options.roundDuration ?? ROUNDS_DURATION;
        gameOptions.objectiveArmDuration = options.objectiveArmDuration ?? OBJECTIVE_ARM_DURATION;
        gameOptions.objectiveDefuseDuration = options.objectiveDefuseDuration ?? OBJECTIVE_DEFUSE_DURATION;
        gameOptions.objectiveFuseDuration = options.objectiveFuseDuration ?? OBJECTIVE_FUSE_DURATION;

        new Scoreboard();

        voiceOvers = new VoiceOvers(gameState, gameOptions);

        setGameState((s) => {
            s.gameStarted = true;
            s.totalRounds = gameOptions.roundObjectives.length;
        });

        logger.log(`Game starting in ${GAME_START_INFO_DURATION}s...`, LogLevel.Info);

        const gameStartClock = new Clocks.CountDownClock(GAME_START_INFO_DURATION, {
            onComplete: () => {
                PlayerUI.deleteGameStartUIs();
                handleNewRound(ALPHA_UNIT, BRAVO_UNIT, gameOptions.roundObjectives.shift()!);
                voiceOvers.playSwitchSidesVoiceOvers();
            },
            onSecond: updateClock,
        });

        gameStartClock.start();
    }

    function handleNewRound(
        attackingUnit: Unit,
        defendingUnit: Unit,
        objectivePositions: Round.ObjectivePositions
    ): void {
        const round: Round = new Round({
            deploymentManager,
            delayDuration: gameOptions.delayDuration,
            roundDuration: gameOptions.roundDuration,
            objectiveArmDuration: gameOptions.objectiveArmDuration,
            objectiveDefuseDuration: gameOptions.objectiveDefuseDuration,
            objectiveFuseDuration: gameOptions.objectiveFuseDuration,
            attackingUnit,
            defendingUnit,
            objectivePositions,
            onRoundCountdownSecond: updateClock,
            onRoundEnd: () => handleRoundEnd(round),
            onDeploymentCountdownSecond: updateClock,
            onDeploymentReleased: () => {
                setGameState((s) => {
                    s.roundDeploymentReleased = true;
                });

                if (gameState.currentRoundId === gameState.totalRounds) {
                    voiceOvers.playLastRoundVoiceOvers();
                } else {
                    voiceOvers.playRoundStartVoiceOvers();
                }
            },
            onArmed: () => {
                setGameState((s) => {
                    s.objectiveArmed = true;
                });

                voiceOvers.playMCOMArmedVoiceOvers();
            },
        });

        setGameState((s) => {
            s.roundStarted = false;
            s.roundDeploymentReleased = false;
            s.roundEnded = false;
            s.objectiveArmed = false;
            s.winCondition = undefined;
            s.winningUnitName = undefined;
            s.currentRoundId = s.currentRoundId + 1;
            s.attackingUnitName = attackingUnit.name;
            s.defendingUnitName = defendingUnit.name;
            s.resetting = false;
        });

        const roundStartInfoClock = new Clocks.CountDownClock(ROUND_START_INFO_DURATION, {
            onComplete: () => {
                setGameState((s) => {
                    s.roundStarted = true;
                });

                round.start();
            },
            onSecond: updateClock,
        });

        roundStartInfoClock.start();
    }

    function handleRoundEnd(round: Round): void {
        const winningUnit = round.winningUnit!;

        const score = gameState.scores[winningUnit.name] + 1;

        setGameState((s) => {
            s.scores[winningUnit.name] = score;
            s.roundEnded = true;
            s.winningUnitName = winningUnit.name;
            s.winCondition = round.winCondition;
        });

        voiceOvers.playRoundEndVoiceOvers();

        if (logger.willLog(LogLevel.Info)) {
            logger.log(`${winningUnit.name} score is now ${score}`, LogLevel.Info);
        }

        const roundEndInfoClock = new Clocks.CountDownClock(ROUND_END_INFO_DURATION, {
            onComplete: () => {
                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`Round ended`, LogLevel.Info);
                }

                if (score >= Math.ceil(gameState.totalRounds / 2)) return handleGameEnd();

                const objectivePositions = gameOptions.roundObjectives.shift();

                if (!objectivePositions) return handleGameEnd();

                setGameState((s) => {
                    s.resetting = true;
                });

                Timers.setTimeout(async () => {
                    voiceOvers.playSwitchSidesVoiceOvers();

                    await Unit.flipTeams(ALPHA_UNIT.teamId, BRAVO_UNIT.teamId);

                    setGameState((s) => {
                        s.teamIds[ALPHA_UNIT.name] = ALPHA_UNIT.teamId;
                        s.teamIds[BRAVO_UNIT.name] = BRAVO_UNIT.teamId;
                    });

                    // Start a new round with the previous defending unit attacking and the previous attacking unit defending.
                    handleNewRound(round.defendingUnit, round.attackingUnit, objectivePositions);
                }, 1_000);
            },
            onSecond: updateClock,
        });

        roundEndInfoClock.start();
    }

    function handleGameEnd(): void {
        const winningUnit =
            gameState.scores[ALPHA_UNIT.name] > gameState.scores[BRAVO_UNIT.name] ? ALPHA_UNIT : BRAVO_UNIT;

        if (logger.willLog(LogLevel.Info)) {
            logger.log(
                `${winningUnit.name} won with ${gameState.scores[winningUnit.name]} points. Game ending in ${GAME_END_INFO_DURATION}s...`,
                LogLevel.Info
            );
        }

        setGameState((s) => {
            s.gameEnded = true;
            s.winningUnitName = winningUnit.name;
            s.winCondition = undefined;
        });

        voiceOvers.playGameEndVoiceOvers();

        const gameEndClock = new Clocks.CountDownClock(GAME_END_INFO_DURATION, {
            onComplete: () => {
                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`Game ended`, LogLevel.Info);
                }

                mod.EndGameMode(winningUnit.team);
            },
            onSecond: updateClock,
        });

        gameEndClock.start();
    }

    // #endregion

    // #region Join/Leave Event Handling

    type Spectator = {
        player: mod.Player;
        playerId: number;
    };

    const spectators: Spectator[] = [];

    function removeSpectator(playerId: number): boolean {
        const index = spectators.findIndex((spectator) => spectator.playerId === playerId);

        if (index === -1) return false;

        spectators.splice(index, 1);
        return true;
    }

    // If a player is not on team Alpha or Bravo, add them to the team with the fewest players, so long as that team has
    // less than 8 players. If both teams are full, make them a spectator.
    function placePlayer(player: mod.Player): boolean {
        const playerId = mod.GetObjId(player);

        const teamId = mod.GetObjId(mod.GetTeam(player));

        // Player is already placed on team Alpha or Bravo.
        if (teamId === ALPHA_UNIT.teamId || teamId === BRAVO_UNIT.teamId) return true;

        const unitWithFewestSoldiers = ALPHA_UNIT.soldierCount < BRAVO_UNIT.soldierCount ? ALPHA_UNIT : BRAVO_UNIT;

        if (unitWithFewestSoldiers.soldierCount < MAX_PLAYERS_PER_UNIT) {
            logger.log(
                `P-${playerId} joined on T-${teamId} and is being placed in ${unitWithFewestSoldiers.name}`,
                LogLevel.Info
            );

            mod.SetTeam(player, unitWithFewestSoldiers.team);

            return true;
        }

        return false;
    }

    function setupPlayer(player: mod.Player): void {
        Timers.setTimeout(() => {
            deploymentManager.handlePlayerJoinGame(player);
            Unit.handlePlayerJoinGame(player);
            PlayerUI.handlePlayerJoinGame(player, () => switchUnit(player));
        }, 3_000);
    }

    Events.OnPlayerJoinGame.subscribe((player: mod.Player) => {
        if (placePlayer(player)) return setupPlayer(player);

        // If the server just became full, disable player join.
        if (!spectators.length) {
            mod.DisablePlayerJoin();
            logger.log(`Server is full, player join disabled`, LogLevel.Info);
        }

        mod.EnablePlayerDeploy(player, false);
        spectators.push({ player, playerId: mod.GetObjId(player) });
    });

    Events.OnPlayerLeaveGame.subscribe((playerId: number) => {
        if (removeSpectator(playerId)) {
            logger.log(`Spectator P-${playerId} has left`, LogLevel.Warning);

            return;
        }

        Soldier.handlePlayerLeaveGame(playerId);
        PlayerUI.handlePlayerLeaveGame(playerId);

        const spectator = spectators.shift();

        if (spectator && placePlayer(spectator.player)) {
            setupPlayer(spectator.player);
        }
    });

    // #endregion
}
