import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';

export namespace SearchAndDestroy {
    // #region DeploymentManagers

    abstract class DeploymentManager {
        public abstract get deployEnabled(): boolean;

        public abstract handleJoined(player: mod.Player): void;

        public abstract handleDeployed(player: mod.Player): void;

        public abstract handleUndeployed(player: mod.Player): void;

        public abstract release(timeUntilRelease?: number, timeUntilLock?: number): void;

        public abstract lock(timeUntilLock?: number, timeUntilRelease?: number): void;
    }

    class ForceDeploymentManager extends DeploymentManager {
        private _runNumber: number = 0;
        private _deployEnabled: boolean = false;

        public get deployEnabled(): boolean {
            return this._deployEnabled;
        }

        public handleJoined(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, this._deployEnabled);
        }

        public handleDeployed(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, false);
        }

        public handleUndeployed(player: mod.Player): void {}

        public release(timeUntilRelease: number = 0, timeUntilLock?: number): void {
            const thisRunNumber = ++this._runNumber;

            Promise.resolve().then(async () => {
                if (timeUntilRelease > 0) {
                    await mod.Wait(timeUntilRelease);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = true));
                mod.DeployAllPlayers();

                if (timeUntilLock === undefined) return;

                // Delay resetting to false by at least 1 second to ensure all players are deployed.
                await mod.Wait(timeUntilLock > 1 ? timeUntilLock : 1);

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = false));
            });
        }

        public lock(timeUntilLock: number = 0, timeUntilRelease?: number): void {
            const thisRunNumber = ++this._runNumber;

            Promise.resolve().then(async () => {
                if (timeUntilLock > 0) {
                    await mod.Wait(timeUntilLock);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = false));

                if (timeUntilRelease === undefined) return;

                if (timeUntilRelease > 0) {
                    await mod.Wait(timeUntilRelease);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = true));
            });
        }
    }

    class SelfDeploymentManager extends DeploymentManager {
        private _runNumber: number = 0;
        private _deployEnabled: boolean = false;

        public get deployEnabled(): boolean {
            return this._deployEnabled;
        }

        public handleJoined(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, this._deployEnabled);
        }

        public handleDeployed(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, false);
        }

        public handleUndeployed(player: mod.Player): void {}

        public release(timeUntilRelease: number = 0, timeUntilLock?: number): void {
            const thisRunNumber = ++this._runNumber;

            Promise.resolve().then(async () => {
                if (timeUntilRelease > 0) {
                    await mod.Wait(timeUntilRelease);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = true));

                if (timeUntilLock === undefined) return;

                if (timeUntilLock > 0) {
                    await mod.Wait(timeUntilLock);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = false));
            });
        }

        public lock(timeUntilLock: number = 0, timeUntilRelease?: number): void {
            const thisRunNumber = ++this._runNumber;

            Promise.resolve().then(async () => {
                if (timeUntilLock > 0) {
                    await mod.Wait(timeUntilLock);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = false));

                if (timeUntilRelease === undefined) return;

                if (timeUntilRelease > 0) {
                    await mod.Wait(timeUntilRelease);
                }

                if (thisRunNumber !== this._runNumber) return;

                mod.EnableAllPlayerDeploy((this._deployEnabled = true));
            });
        }
    }

    // #endregion

    // #region Constants

    const FORCE_DEPLOY = true;
    const ALLOW_SWITCH_TEAMS = true; // true for no revives.
    const SKIP_MAN_DOWN = true;
    const ROUND_DELAY_DURATION = 10; // TODO: reset to 20 seconds
    const ROUNDS_DURATION = 90; // TODO: reset to 360 seconds = 6 minutes
    const ROUNDS_TO_WIN = 5; // TODO: This needs to be tied to the experience timing settings.
    const OBJECTIVE_FUSE_DURATION = 30; // TODO: reset to 60 seconds
    const OBJECTIVE_ARM_DURATION = 7;
    const OBJECTIVE_DEFUSE_DURATION = 10;
    const GAME_START_INFO_DURATION = 10;
    const ROUND_START_INFO_DURATION = 5;
    const ROUND_END_TEARDOWN_DELAY_DURATION = 3;
    const ROUND_END_INFO_DURATION = 5;
    const FLIP_TEAMS_BUFFER_DURATION = 2;
    const GAME_END_INFO_DURATION = 10;

    // #endregion

    // #region Logging

    const logger = new Logging('SND');

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
        roundsToWin?: number;
        objectiveArmDuration?: number;
        objectiveDefuseDuration?: number;
        objectiveFuseDuration?: number;
    };

    type GameState = {
        options: Options;
        started: boolean;
        rounds: Round[];
        scores: Record<Unit.Name, number>;
    };

    const gameState: GameState = {
        options: {
            allowSwitchTeams: ALLOW_SWITCH_TEAMS,
            roundObjectives: [],
            delayDuration: ROUND_DELAY_DURATION,
            roundDuration: ROUNDS_DURATION,
            roundsToWin: ROUNDS_TO_WIN,
            objectiveArmDuration: OBJECTIVE_ARM_DURATION,
            objectiveDefuseDuration: OBJECTIVE_DEFUSE_DURATION,
            objectiveFuseDuration: OBJECTIVE_FUSE_DURATION,
        },
        started: false,
        rounds: [],
        scores: {
            ['Alpha']: 0,
            ['Bravo']: 0,
        },
    };

    const deploymentManager = FORCE_DEPLOY ? new ForceDeploymentManager() : new SelfDeploymentManager();

    // #endregion

    // #region Game Functions

    function setOptions(options: Options): boolean {
        if (options.roundObjectives.length === 0) {
            logger.log(`No objectives provided.`, LogLevel.Info);
            return false;
        }

        gameState.options.allowSwitchTeams = options.allowSwitchTeams ?? ALLOW_SWITCH_TEAMS;
        gameState.options.roundObjectives = options.roundObjectives;
        gameState.options.delayDuration = options.delayDuration ?? ROUND_DELAY_DURATION;
        gameState.options.roundDuration = options.roundDuration ?? ROUNDS_DURATION;
        gameState.options.roundsToWin = options.roundsToWin ?? ROUNDS_TO_WIN;
        gameState.options.objectiveArmDuration = options.objectiveArmDuration ?? OBJECTIVE_ARM_DURATION;
        gameState.options.objectiveDefuseDuration = options.objectiveDefuseDuration ?? OBJECTIVE_DEFUSE_DURATION;
        gameState.options.objectiveFuseDuration = options.objectiveFuseDuration ?? OBJECTIVE_FUSE_DURATION;

        return true;
    }

    export async function start(options: Options): Promise<void> {
        if (gameState.started) return;
        if (!setOptions(options)) return;

        gameState.started = true;

        if (logger.willLog(LogLevel.Info)) {
            logger.log(`Game starting in ${GAME_START_INFO_DURATION}s...`, LogLevel.Info);
        }

        await mod.Wait(GAME_START_INFO_DURATION);

        if (logger.willLog(LogLevel.Info)) {
            logger.log(`Game started.`, LogLevel.Info);
        }

        // `setOptions` succeeding implies that there are objectives provided.
        handleNewRound(Unit.ALPHA, Unit.BRAVO, gameState.options.roundObjectives.shift()!);
    }

    function getCurrentRound(): Round | undefined {
        return gameState.rounds[gameState.rounds.length - 1];
    }

    async function handleNewRound(
        attackingUnit: Unit,
        defendingUnit: Unit,
        objectivePositions: Round.ObjectivePositions
    ): Promise<void> {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(
                `Starting new round with ${attackingUnit.name} attacking and ${defendingUnit.name} defending in ${ROUND_START_INFO_DURATION}s...`,
                LogLevel.Info
            );
        }

        const round: Round = new Round({
            deploymentManager,
            roundEndCallback: () => handleRoundEnd(round),
            delayDuration: gameState.options.delayDuration,
            roundDuration: gameState.options.roundDuration,
            objectiveArmDuration: gameState.options.objectiveArmDuration,
            objectiveDefuseDuration: gameState.options.objectiveDefuseDuration,
            objectiveFuseDuration: gameState.options.objectiveFuseDuration,
            attackingUnit,
            defendingUnit,
            objectivePositions,
        });

        gameState.rounds.push(round);

        await mod.Wait(ROUND_START_INFO_DURATION);

        round.start();
    }

    async function handleGameEnd(): Promise<void> {
        const winningUnit =
            gameState.scores[Unit.ALPHA.name] > gameState.scores[Unit.BRAVO.name] ? Unit.ALPHA : Unit.BRAVO;

        if (logger.willLog(LogLevel.Info)) {
            logger.log(
                `${winningUnit.name} won with ${gameState.scores[winningUnit.name]} points. Game ending in ${GAME_END_INFO_DURATION}s...`,
                LogLevel.Info
            );
        }

        await mod.Wait(GAME_END_INFO_DURATION);

        if (logger.willLog(LogLevel.Info)) {
            logger.log(`Game ended.`, LogLevel.Info);
        }

        mod.EndGameMode(winningUnit.team);
    }

    async function handleRoundEnd(round: Round): Promise<void> {
        if (!round.winningUnit) return;

        const score = ++gameState.scores[round.winningUnit.name];

        if (logger.willLog(LogLevel.Info)) {
            logger.log(
                `${round.winningUnit.name} score is now ${score}. Round ending in ${ROUND_END_INFO_DURATION}s...`,
                LogLevel.Info
            );
        }

        await mod.Wait(ROUND_END_INFO_DURATION);

        if (logger.willLog(LogLevel.Info)) {
            logger.log(`Round ended.`, LogLevel.Info);
        }

        if (score >= ROUNDS_TO_WIN) return handleGameEnd();

        const objectivePositions = gameState.options.roundObjectives.shift();

        if (!objectivePositions) return handleGameEnd();

        await Unit.flipTeams();

        // Start a new round with the previous defending unit attacking and the previous attacking unit defending.
        handleNewRound(round.defendingUnit, round.attackingUnit, objectivePositions);
    }

    // #endregion

    // #region Event Subscriptions

    Events.OnMCOMArmed.subscribe((mcom: mod.MCOM) => {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(`MCOM-${mod.GetObjId(mcom)} armed.`, LogLevel.Info);
        }

        const currentRound = getCurrentRound();

        if (!currentRound) return;

        currentRound.handleArmed(mcom);
    });

    Events.OnMCOMDefused.subscribe((mcom: mod.MCOM) => {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(`MCOM-${mod.GetObjId(mcom)} defused.`, LogLevel.Info);
        }

        const currentRound = getCurrentRound();

        if (!currentRound) return;

        currentRound.handleDefused(mcom);
    });

    Events.OnMCOMDestroyed.subscribe((mcom: mod.MCOM) => {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(`MCOM-${mod.GetObjId(mcom)} destroyed.`, LogLevel.Info);
        }

        const currentRound = getCurrentRound();

        if (!currentRound) return;

        currentRound.handleDestroyed(mcom);
    });

    Events.OnPlayerJoinGame.subscribe((player: mod.Player) => {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(`P-${mod.GetObjId(player)} joined game.`, LogLevel.Info);
        }

        deploymentManager.handleJoined(player);
        Round.handleJoined(player);
    });

    Events.OnPlayerDeployed.subscribe((player: mod.Player) => {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(`P-${mod.GetObjId(player)} deployed.`, LogLevel.Info);
        }

        const currentRound = getCurrentRound();

        if (!currentRound) return;

        deploymentManager.handleDeployed(player);
        currentRound.handleDeployed(player);
    });

    Events.OnPlayerUndeploy.subscribe((player: mod.Player) => {
        if (logger.willLog(LogLevel.Info)) {
            logger.log(`P-${mod.GetObjId(player)} undeployed.`, LogLevel.Info);
        }

        const currentRound = getCurrentRound();

        if (!currentRound) return;

        deploymentManager.handleUndeployed(player);
        currentRound.handleUndeployed(player);
    });

    // #endregion

    // #region Classes

    class Round {
        public static readonly DEFAULT_DELAY_DURATION = 20;
        public static readonly DEFAULT_ROUND_DURATION = 360; // 360 seconds = 6 minutes

        public static handleJoined(player: mod.Player): void {
            Unit.createSoldier(player);
            // TODO: Determine what to do if the join is mid-round.
        }

        public constructor(options: Round.Options) {
            this._delayDuration = options.delayDuration ?? Round.DEFAULT_DELAY_DURATION;
            this._roundDuration = options.roundDuration ?? Round.DEFAULT_ROUND_DURATION;
            this._attackingUnit = options.attackingUnit;
            this._defendingUnit = options.defendingUnit;
            this._roundEndCallback = options.roundEndCallback;
            this._deploymentManager = options.deploymentManager;

            const objectiveOptions: Objective.Options = {
                armDuration: options.objectiveArmDuration ?? OBJECTIVE_ARM_DURATION,
                defuseDuration: options.objectiveDefuseDuration ?? OBJECTIVE_DEFUSE_DURATION,
                fuseDuration: options.objectiveFuseDuration ?? OBJECTIVE_FUSE_DURATION,
            };

            for (const objectivePosition of options.objectivePositions) {
                this._objectives.push(new Objective(objectivePosition, objectiveOptions));
            }

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Round created with ${this._objectives.length} objectives.`, LogLevel.Info);
            }
        }

        private _attackingUnit: Unit;
        private _defendingUnit: Unit;
        private _objectives: Objective[] = [];
        private _roundEndCallback: () => Promise<void> | void;
        private _deploymentManager: DeploymentManager;
        private _delayDuration: number;
        private _delayTimer?: number;
        private _delayStartTime?: number;
        private _delayEndTime?: number;
        private _roundDuration: number;
        private _roundTimer?: number;
        private _startTime?: number;
        private _endTime?: number;
        private _winningUnit?: Unit;
        private _armedObjective?: Objective;

        private async _start(): Promise<void> {
            if (this._startTime) {
                logger.log(`Round already started.`, LogLevel.Info);
                return;
            }

            // Release all players for the round duration.
            this._deploymentManager.release(0, this._roundDuration);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Round started. All players released.`, LogLevel.Info);
            }

            this._roundTimer = Timers.setTimeout(() => {
                this._roundTimer = undefined;
                this._tryEndRound(this._defendingUnit); // End the round with the defending unit winning.
            }, this._roundDuration * 1_000); // Convert seconds to milliseconds.
        }

        private _stopRoundTimer(): void {
            Timers.clearTimeout(this._roundTimer);
            this._roundTimer = undefined;
        }

        private _tryEndRound(winningUnit: Unit): void {
            logger.log(`_tryEndRound`, LogLevel.Info);

            if (!this._startTime) {
                logger.log(`Can't end round that hasn't started yet.`, LogLevel.Info);
                return;
            }

            if (this._endTime) {
                logger.log(`Can't end round that has already ended.`, LogLevel.Info);
                return;
            }

            this._stopRoundTimer();

            // If the defenders are passed as the winning unit, only end the game if there is no armed objective.
            if (winningUnit === this._defendingUnit && this._armedObjective) return;

            this._endTime = Date.now();
            this._winningUnit = winningUnit;

            // Lock all players from deploying indefinitely.
            this._deploymentManager.lock(0);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `${winningUnit === this._attackingUnit ? 'Attackers' : 'Defenders'} (${winningUnit.name}) won. Locked deployments.`,
                    LogLevel.Info
                );
            }

            // Don't undeploy players that are alive and MCOms abruptly.
            Timers.setTimeout(() => {
                mod.UndeployAllPlayers();

                while (this._objectives.length > 0) {
                    this._objectives.pop()?.remove();
                }

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`Undeployed all players and removed all objectives.`, LogLevel.Info);
                }
            }, ROUND_END_TEARDOWN_DELAY_DURATION * 1_000); // Convert seconds to milliseconds.

            this._roundEndCallback();
        }

        public get delayDuration(): number {
            return this._delayDuration;
        }

        public get roundDuration(): number {
            return this._roundDuration;
        }

        public get attackingUnit(): Unit {
            return this._attackingUnit;
        }

        public get defendingUnit(): Unit {
            return this._defendingUnit;
        }

        public get objectives(): Objective[] {
            return this._objectives;
        }

        public get delayTimeElapsed(): number {
            return this._delayStartTime
                ? Math.min(Date.now(), this._delayEndTime ?? Number.MAX_SAFE_INTEGER) - this._delayStartTime
                : 0;
        }

        public get delayTimeLeft(): number {
            return this._delayDuration - this.delayTimeElapsed;
        }

        public get timeElapsed(): number {
            return this._startTime
                ? Math.min(Date.now(), this._endTime ?? Number.MAX_SAFE_INTEGER) - this._startTime
                : 0;
        }

        public get timeLeft(): number {
            // If the round has ended, there is no time left, otherwise if an objective is armed, return the time left
            // for that objective, otherwise return the time left for the round.
            return this._endTime
                ? 0
                : this._armedObjective
                  ? (this._armedObjective.timeLeft ?? 0)
                  : this._roundDuration - this.timeElapsed;
        }

        public get winningUnit(): Unit | undefined {
            return this._winningUnit;
        }

        public start(): void {
            if (this._delayDuration === 0) {
                this._start();
                return;
            }

            this._delayStartTime = Date.now();

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Delaying round start by ${this._delayDuration}s...`, LogLevel.Info);
            }

            this._delayTimer = Timers.setTimeout(() => {
                this._delayTimer = undefined;
                this._delayEndTime = Date.now();
                this._start();
            }, this._delayDuration * 1_000); // Convert seconds to milliseconds.
        }

        public handleArmed(mcom: mod.MCOM): void {
            const objective = Objective.getObjective(mcom);

            if (!objective) return;

            if (this._armedObjective) {
                logger.log(`An objective has already been armed.`, LogLevel.Info);
                return;
            }

            // Round no loner bound by default timer as there is an active objective.
            this._stopRoundTimer();
            this._armedObjective = objective;

            objective.handleArmed();

            // Disable all other objectives.
            for (const otherObjective of this._objectives) {
                if (otherObjective === objective) continue;

                otherObjective.disable();
            }
        }

        public handleDefused(mcom: mod.MCOM): void {
            const objective = Objective.getObjective(mcom);

            if (!objective) return;

            if (this._armedObjective !== objective) {
                logger.log(`Defused objective does not match the armed objective.`, LogLevel.Info);
                return;
            }

            this._armedObjective = undefined;
            this._tryEndRound(this._defendingUnit); // End the round with the defending unit winning.

            objective.handleDefused();
        }

        public handleDestroyed(mcom: mod.MCOM): void {
            const objective = Objective.getObjective(mcom);

            if (!objective) return;

            if (this._armedObjective !== objective) {
                logger.log(`Destroyed objective does not match the armed objective.`, LogLevel.Info);
                return;
            }

            this._armedObjective = undefined;
            this._tryEndRound(this._attackingUnit); // End the round with the attacking unit winning.

            objective.handleDestroyed();
        }

        public handleDeployed(player: mod.Player): void {
            const soldier = Soldier.getSoldier(player);

            if (!soldier) return;

            soldier.handleDeployed();
        }

        public handleUndeployed(player: mod.Player): void {
            const soldier = Soldier.getSoldier(player);

            if (!soldier) return;

            soldier.handleUndeployed();

            const unit = soldier.unit;

            if (this._endTime || unit.activeSoldiers.length) return;

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Unit ${unit.name} has no active soldiers. Trying to end round...`, LogLevel.Info);
            }

            // Try to end the round with the other unit winning.
            this._tryEndRound(unit === Unit.ALPHA ? Unit.BRAVO : Unit.ALPHA);
        }
    }

    namespace Round {
        export type ObjectivePositions = Objective.Position[];

        export type Options = {
            attackingUnit: Unit;
            defendingUnit: Unit;
            objectivePositions: Round.ObjectivePositions;
            roundEndCallback: () => Promise<void> | void;
            deploymentManager: DeploymentManager;
            delayDuration?: number;
            roundDuration?: number;
            objectiveArmDuration?: number;
            objectiveDefuseDuration?: number;
            objectiveFuseDuration?: number;
        };
    }

    class Unit {
        public static readonly ALPHA = new Unit('Alpha', 1);
        public static readonly BRAVO = new Unit('Bravo', 2);

        private readonly _SOLDIERS = new Set<Soldier>();

        public static async flipTeams(): Promise<void> {
            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Flipping teams...`, LogLevel.Info);
            }

            const alphaPreviousTeamId = this.ALPHA._teamId;
            const bravoPreviousTeamId = this.BRAVO._teamId;
            mod.SwitchTeams(this.ALPHA._team, this.BRAVO._team);
            this.ALPHA._teamId = bravoPreviousTeamId;
            this.BRAVO._teamId = alphaPreviousTeamId;

            await mod.Wait(FLIP_TEAMS_BUFFER_DURATION);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Teams flipped.`, LogLevel.Info);
            }
        }

        public static createSoldier(player: mod.Player): void {
            const teamId = mod.GetObjId(mod.GetTeam(player));
            const unit = teamId === this.ALPHA._teamId ? this.ALPHA : this.BRAVO;
            const soldier = new Soldier(player, unit, SKIP_MAN_DOWN);
            unit._SOLDIERS.add(soldier);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`P-${mod.GetObjId(player)} Soldier created for ${unit.name}.`, LogLevel.Info);
            }
        }

        public static switchUnit(player: mod.Player): void {
            // TODO: Somehow make sure the unit size is not exceeded.
            const soldier = Soldier.getSoldier(player);

            if (!soldier) return;

            const currentUnit = soldier.unit;
            const newUnit = currentUnit === this.ALPHA ? this.BRAVO : this.ALPHA;

            // TODO: Need to undeploy the player first, and also ensure it can only happen at appropriate times.

            mod.SetTeam(player, newUnit.team);
            currentUnit._SOLDIERS.delete(soldier);
            newUnit._SOLDIERS.add(soldier);
        }

        private constructor(name: Unit.Name, teamId: number) {
            this._name = name;
            this._teamId = teamId;
            this._team = mod.GetTeam(teamId);
        }

        private _name: Unit.Name;
        private _team: mod.Team;
        private _teamId: number;

        public get name(): Unit.Name {
            return this._name;
        }

        public get team(): mod.Team {
            return this._team;
        }

        public get teamId(): number {
            return this._teamId;
        }

        public set teamId(teamId: number) {
            this._teamId = teamId;
            this._team = mod.GetTeam(teamId);
        }

        public get soldierCount(): number {
            return this._SOLDIERS.size;
        }

        public get activeSoldiers(): Soldier[] {
            return Array.from(this._SOLDIERS).filter((soldier) => soldier.state === Soldier.State.Active);
        }
    }

    namespace Unit {
        export type Name = 'Alpha' | 'Bravo';
    }

    class Soldier {
        private static readonly _SOLDIERS = new Map<number, Soldier>();

        public static getSoldier(player: mod.Player): Soldier | undefined {
            return Soldier._SOLDIERS.get(mod.GetObjId(player));
        }

        public constructor(player: mod.Player, unit: Unit, skipManDown: boolean = false) {
            this._player = player;
            this._playerId = mod.GetObjId(player);
            this._unit = unit;

            mod.SetRedeployTime(player, 0);
            mod.SkipManDown(player, skipManDown);

            Soldier._SOLDIERS.set(this._playerId, this);
        }

        private _player: mod.Player;
        private _playerId: number;
        private _unit: Unit;
        private _state: Soldier.State = Soldier.State.Inactive;

        public get player(): mod.Player {
            return this._player;
        }

        public get playerId(): number {
            return this._playerId;
        }

        public get unit(): Unit {
            return this._unit;
        }

        public get state(): Soldier.State {
            return this._state;
        }

        public handleDeployed(): void {
            this._state = Soldier.State.Active;
        }

        public handleUndeployed(): void {
            this._state = Soldier.State.Inactive;
        }
    }

    namespace Soldier {
        export enum State {
            Active = 'active',
            Inactive = 'inactive',
        }
    }

    class Objective {
        public static readonly DEFAULT_FUSE_DURATION = 60; // 60 seconds
        public static readonly DEFAULT_ARM_DURATION = 7; // 7 seconds
        public static readonly DEFAULT_DEFUSE_DURATION = 10; // 10 seconds

        private static readonly _OBJECTIVES = new Map<number, Objective>();

        public static getObjective(mcom: mod.MCOM): Objective | undefined {
            return Objective._OBJECTIVES.get(mod.GetObjId(mcom));
        }

        public constructor(position: Objective.Position, options?: Objective.Options) {
            this._mcom = mod.SpawnObject(
                mod.RuntimeSpawn_Common.MCOM,
                toVector(position.x, position.y, position.z),
                toRotationVector(position.orientation)
            ) as mod.MCOM;

            this._id = mod.GetObjId(this._mcom);
            this._armDuration = options?.armDuration ?? Objective.DEFAULT_ARM_DURATION;
            this._defuseDuration = options?.defuseDuration ?? Objective.DEFAULT_DEFUSE_DURATION;
            this._fuseDuration = options?.fuseDuration ?? Objective.DEFAULT_FUSE_DURATION;

            mod.SetMCOMFuseTime(this._mcom, this._fuseDuration);

            this._enabled = true;

            Objective._OBJECTIVES.set(this._id, this);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `Objective-${this._id} created at <${position.x}, ${position.y}, ${position.z}> (${position.orientation}-deg).`,
                    LogLevel.Info
                );
            }
        }

        private _id?: number;
        private _mcom?: mod.MCOM;
        private _enabled: boolean;
        private _armDuration: number;
        private _defuseDuration: number;
        private _fuseDuration: number;
        private _armedTime?: number;
        private _defusedTime?: number;
        private _destroyedTime?: number;

        public get armedTime(): number | undefined {
            return this._armedTime;
        }

        public get defusedTime(): number | undefined {
            return this._defusedTime;
        }

        public get destroyedTime(): number | undefined {
            return this._destroyedTime;
        }

        public get state(): Objective.State {
            if (!this._id || !this._mcom) return Objective.State.Removed;
            if (!this._enabled) return Objective.State.Disabled;
            if (this._destroyedTime) return Objective.State.Destroyed;
            if (this._defusedTime) return Objective.State.Defused;
            if (this._armedTime) return Objective.State.Armed;
            return Objective.State.Idle;
        }

        public get fuseElapsed(): number | undefined {
            return this.state === Objective.State.Armed ? Date.now() - this._armedTime! : undefined;
        }

        public get timeLeft(): number | undefined {
            return this.state === Objective.State.Armed ? this._fuseDuration - this.fuseElapsed! : undefined;
        }

        public handleArmed(): void {
            this._armedTime = Date.now();
        }

        public handleDefused(): void {
            this._defusedTime = Date.now();
        }

        public handleDestroyed(): void {
            this._destroyedTime = Date.now();
        }

        public disable(): void {
            if (!this._mcom) {
                logger.log(`Objective dose not exist and cannot be disabled.`, LogLevel.Info);
                return;
            }

            this._enabled = false;
            mod.EnableGameModeObjective(this._mcom, false);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Objective-${this._id} disabled.`, LogLevel.Info);
            }
        }

        public remove(): void {
            if (!this._mcom) {
                logger.log(`Objective dose not exist and cannot be removed.`, LogLevel.Info);
                return;
            }

            mod.UnspawnObject(this._mcom);
            Objective._OBJECTIVES.delete(this._id!);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`Objective-${this._id} removed.`, LogLevel.Info);
            }

            this._mcom = undefined;
            this._id = undefined;
        }
    }

    namespace Objective {
        export type Position = {
            x: number;
            y: number;
            z: number;
            orientation: number;
        };

        export type Options = {
            armDuration?: number;
            defuseDuration?: number;
            fuseDuration?: number;
        };

        export enum State {
            Idle = 'idle',
            Armed = 'armed',
            Defused = 'defused',
            Destroyed = 'destroyed',
            Disabled = 'disabled',
            Removed = 'removed',
        }
    }

    // #endregion

    // #region Helpers

    function toVector(x: number, y: number, z: number): mod.Vector {
        return mod.CreateVector(x, y, z);
    }

    function toRotationVector(orientation: number): mod.Vector {
        return mod.CreateVector(0, mod.DegreesToRadians(180 - orientation), 0);
    }

    // #endregion
}
