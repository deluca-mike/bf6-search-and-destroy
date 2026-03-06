import { Clocks } from 'bf6-portal-utils/clocks/index.ts';
import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { SolidUI } from 'bf6-portal-utils/solid-ui/index.ts';

import { UI } from 'bf6-portal-utils/ui/index.ts';
import { UIContainer } from 'bf6-portal-utils/ui/components/container/index.ts';
import { UIText } from 'bf6-portal-utils/ui/components/text/index.ts';

export namespace SearchAndDestroy {
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

    // #region DeploymentManagers

    // TODO: Can probably combine most of the logic of ForceDeploymentManager and SelfDeploymentManager into a single class.
    abstract class DeploymentManager {
        public constructor() {
            Events.OnPlayerJoinGame.subscribe((player: mod.Player) => {
                if (logger.willLog(LogLevel.Debug)) {
                    logger.log(`<DM> P-${mod.GetObjId(player)} joined`, LogLevel.Debug);
                }

                this._handleJoined(player);
            });

            Events.OnPlayerDeployed.subscribe((player: mod.Player) => {
                if (logger.willLog(LogLevel.Debug)) {
                    logger.log(`<DM> P-${mod.GetObjId(player)} deployed`, LogLevel.Debug);
                }

                this._handleDeployed(player);
            });

            Events.OnPlayerUndeploy.subscribe((player: mod.Player) => {
                if (logger.willLog(LogLevel.Debug)) {
                    logger.log(`<DM> P-${mod.GetObjId(player)} undeployed`, LogLevel.Debug);
                }

                this._handleUndeploy(player);
            });
        }

        protected abstract _handleJoined(player: mod.Player): void;

        protected abstract _handleDeployed(player: mod.Player): void;

        protected abstract _handleUndeploy(player: mod.Player): void;

        public abstract get deployEnabled(): boolean;

        public abstract release(timeUntilRelease?: number, timeUntilLock?: number): void;

        public abstract lock(timeUntilLock?: number, timeUntilRelease?: number): void;
    }

    class ForceDeploymentManager extends DeploymentManager {
        private _timeout?: number;
        private _deployEnabled: boolean = false;

        public get deployEnabled(): boolean {
            return this._deployEnabled;
        }

        protected _handleJoined(player: mod.Player): void {
            mod.SetRedeployTime(player, 0);
            mod.EnablePlayerDeploy(player, this._deployEnabled);
        }

        protected _handleDeployed(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, false);
        }

        protected _handleUndeploy(player: mod.Player): void {}

        public release(timeUntilRelease: number = 0, timeUntilLock?: number): void {
            Timers.clear(this._timeout);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<FDM> Deploying players in ${timeUntilRelease / 1_000}s...`, LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(() => {
                mod.EnableAllPlayerDeploy((this._deployEnabled = true));
                mod.DeployAllPlayers();

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Players deployed`, LogLevel.Info);
                }

                if (timeUntilLock === undefined) return;

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, LogLevel.Info);
                }

                this._timeout = Timers.setTimeout(
                    () => {
                        mod.EnableAllPlayerDeploy((this._deployEnabled = false));

                        if (logger.willLog(LogLevel.Info)) {
                            logger.log(`<FDM> Deployment disabled`, LogLevel.Info);
                        }
                    },
                    timeUntilLock > 1 ? timeUntilLock : 1
                );
            }, timeUntilRelease);
        }

        public lock(timeUntilLock: number = 0, timeUntilRelease?: number): void {
            Timers.clear(this._timeout);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<FDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(() => {
                mod.EnableAllPlayerDeploy((this._deployEnabled = false));

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Deployment disabled`, LogLevel.Info);
                }

                if (timeUntilRelease === undefined) return;

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Deploying players in ${timeUntilRelease / 1_000}s...`, LogLevel.Info);
                }

                this._timeout = Timers.setTimeout(() => {
                    mod.EnableAllPlayerDeploy((this._deployEnabled = true));
                    mod.DeployAllPlayers();

                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(`<FDM> Players deployed`, LogLevel.Info);
                    }
                }, timeUntilRelease);
            }, timeUntilLock);
        }
    }

    class SelfDeploymentManager extends DeploymentManager {
        private _timeout?: number;
        private _deployEnabled: boolean = false;

        public get deployEnabled(): boolean {
            return this._deployEnabled;
        }

        protected _handleJoined(player: mod.Player): void {
            mod.SetRedeployTime(player, 0);
            mod.EnablePlayerDeploy(player, this._deployEnabled);
        }

        protected _handleDeployed(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, false);
        }

        protected _handleUndeploy(player: mod.Player): void {}

        public release(timeUntilRelease: number = 0, timeUntilLock?: number): void {
            Timers.clear(this._timeout);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<SDM> Enabling deployment in ${timeUntilRelease / 1_000}s...`, LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(() => {
                mod.EnableAllPlayerDeploy((this._deployEnabled = true));

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<SDM> Deployment enabled`, LogLevel.Info);
                }

                if (timeUntilLock === undefined) return;

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<SDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, LogLevel.Info);
                }

                this._timeout = Timers.setTimeout(
                    () => {
                        mod.EnableAllPlayerDeploy((this._deployEnabled = false));

                        if (logger.willLog(LogLevel.Info)) {
                            logger.log(`<SDM> Deployment disabled`, LogLevel.Info);
                        }
                    },
                    timeUntilLock > 1 ? timeUntilLock : 1
                );
            }, timeUntilRelease);
        }

        public lock(timeUntilLock: number = 0, timeUntilRelease?: number): void {
            Timers.clear(this._timeout);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<SDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(() => {
                mod.EnableAllPlayerDeploy((this._deployEnabled = false));

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<SDM> Deployment enabled`, LogLevel.Info);
                }

                if (timeUntilRelease === undefined) return;

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<SDM> Enabling deployment in ${timeUntilRelease / 1_000}s...`, LogLevel.Info);
                }

                this._timeout = Timers.setTimeout(() => {
                    mod.EnableAllPlayerDeploy((this._deployEnabled = true));

                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(`<SDM> Deployment enabled`, LogLevel.Info);
                    }
                }, timeUntilRelease);
            }, timeUntilLock);
        }
    }

    // #endregion

    // #region Constants

    const FORCE_DEPLOY = true;
    const ALLOW_SWITCH_TEAMS = true; // true for no revives.
    const SKIP_MAN_DOWN = true;
    const ROUND_DELAY_DURATION = 10;
    const ROUNDS_DURATION = 60; // TODO: reset to 360 seconds = 6 minutes
    const ROUNDS_TO_WIN = 5; // TODO: This needs to be tied to the experience timing settings.
    const OBJECTIVE_FUSE_DURATION = 20; // TODO: reset to 60 seconds
    const OBJECTIVE_ARM_DURATION = 7;
    const OBJECTIVE_DEFUSE_DURATION = 10;
    const GAME_START_INFO_DURATION = 15;
    const ROUND_START_INFO_DURATION = 10;
    const ROUND_END_TEARDOWN_DELAY_DURATION = 5;
    const ROUND_END_INFO_DURATION = 10;
    const FLIP_TEAMS_BUFFER_DURATION_MS = 2_000;
    const GAME_END_INFO_DURATION = 10;

    // #endregion

    // #region Classes

    class Round {
        public static readonly DEFAULT_DELAY_DURATION = 20;
        public static readonly DEFAULT_ROUND_DURATION = 360; // 360 seconds = 6 minutes

        public constructor(params: Round.Params) {
            this._delayDuration = params.delayDuration ?? Round.DEFAULT_DELAY_DURATION;
            this._roundDuration = params.roundDuration ?? Round.DEFAULT_ROUND_DURATION;
            this._attackingUnit = params.attackingUnit;
            this._defendingUnit = params.defendingUnit;
            this._deploymentManager = params.deploymentManager;
            this._onRoundCountdownSecond = params.onRoundCountdownSecond;
            this._onRoundEnd = params.onRoundEnd;
            this._onDeploymentCountdownSecond = params.onDeploymentCountdownSecond;
            this._onDeploymentReleased = params.onDeploymentReleased;

            const objectiveOptions: Objective.Options = {
                armDuration: params.objectiveArmDuration ?? OBJECTIVE_ARM_DURATION,
                defuseDuration: params.objectiveDefuseDuration ?? OBJECTIVE_DEFUSE_DURATION,
                fuseDuration: params.objectiveFuseDuration ?? OBJECTIVE_FUSE_DURATION,
            };

            for (const objectivePosition of params.objectivePositions) {
                const objectiveCallbacks: Objective.Callbacks = {
                    onArmed: () => this._handleObjectiveArmed(objective),
                    onDefused: () => this._handleObjectiveDefused(objective),
                    onDestroyed: () => this._handleObjectiveDestroyed(objective),
                };

                const objective = new Objective(objectivePosition, objectiveCallbacks, objectiveOptions);

                this._objectives.push(objective);
            }

            this._roundClock = new Clocks.CountDownClock(this._roundDuration, {
                onComplete: () => this._end(),
                onSecond: (seconds) => {
                    this._onRoundCountdownSecond?.(seconds);
                    logger.log(`<R> Round ends in ${seconds}s...`, LogLevel.Debug);
                },
            });

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `<R> Round created with ${this._attackingUnit.name} attacking and ${this._defendingUnit.name} defending ${this._objectives.length} objectives`,
                    LogLevel.Info
                );
            }
        }

        private _attackingUnit: Unit;
        private _defendingUnit: Unit;
        private _objectives: Objective[] = [];
        private _deploymentManager: DeploymentManager;
        private _delayDuration: number;
        private _roundDuration: number;
        private _startTime?: number;
        private _deploymentTime?: number;
        private _endTime?: number;
        private _winningUnit?: Unit;
        private _armedObjective?: Objective;
        private _roundClock: Clocks.CountDownClock;
        private _onRoundCountdownSecond?: (seconds: number) => void;
        private _onRoundEnd: () => Promise<void> | void;
        private _onDeploymentCountdownSecond?: (seconds: number) => void;
        private _onDeploymentReleased?: () => Promise<void> | void;

        public start(): void {
            if (this._startTime) {
                logger.log(`<R> Round already started`, LogLevel.Warning);
                return;
            }

            this._startTime = Date.now();

            const deploymentClock = new Clocks.CountDownClock(this._delayDuration, {
                onComplete: () => {
                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(`<R> Round started`, LogLevel.Info);
                    }

                    this._deploymentTime = Date.now();

                    Soldier.setStateForAll(Soldier.State.NotYetDeployed);

                    this._onDeploymentReleased?.();

                    // Release all players for the round duration.
                    this._deploymentManager.release(); // TODO: Consider locking the deployment sooner.

                    this._roundClock.start();
                },
                onSecond: (seconds) => {
                    this._onDeploymentCountdownSecond?.(seconds);
                    logger.log(`<R> Deployment in ${seconds}s...`, LogLevel.Debug);
                },
            });

            deploymentClock.start();
        }

        private _end(): void {
            if (this._endTime) {
                logger.log(`<R> Round already ended`, LogLevel.Warning);
                return;
            }

            this._endTime = Date.now();
            this._deploymentManager.lock(); // Lock all players from deploying indefinitely.
            Soldier.setStateForAll(Soldier.State.Undeployed);

            this._winningUnit = this._armedObjective
                ? this._attackingUnit
                : this._defendingUnit.activeSoldiers.length > 0
                  ? this._defendingUnit
                  : this._attackingUnit;

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `<R> ${this._winningUnit === this._attackingUnit ? 'Attackers' : 'Defenders'} (${this._winningUnit.name}) won`,
                    LogLevel.Info
                );
            }

            // Don't undeploy MCOMs and players that are alive abruptly.
            Timers.setTimeout(() => {
                mod.UndeployAllPlayers();

                while (this._objectives.length > 0) {
                    this._objectives.pop()?.remove();
                }

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<R> Undeployed all players and removed all objectives`, LogLevel.Info);
                }
            }, ROUND_END_TEARDOWN_DELAY_DURATION * 1_000); // Convert seconds to milliseconds.

            this._onRoundEnd?.();
        }

        private _handleObjectiveArmed(objective: Objective): void {
            if (this._armedObjective) {
                logger.log(`<R> An objective has already been armed`, LogLevel.Warning);
                return;
            }

            // Round no loner bound by default timer as there is an active objective.
            this._armedObjective = objective;

            // Disable all other objectives.
            for (const otherObjective of this._objectives) {
                if (otherObjective === objective) continue;

                otherObjective.disable();
            }

            this._roundClock.reset();
            this._roundClock.setDuration(objective.timeLeft!);
            this._roundClock.start();

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<R> Objective armed. Disabled all other objectives and updated round clock`, LogLevel.Info);
            }
        }

        private _handleObjectiveDefused(objective: Objective): void {
            if (this._armedObjective !== objective) {
                logger.log(`<R> Defused objective does not match the armed objective`, LogLevel.Warning);
                return;
            }

            this._armedObjective = undefined;
            this._roundClock.stop();

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<R> Objective defused. Stopped round clock and ending round`, LogLevel.Info);
            }

            this._end();
        }

        private _handleObjectiveDestroyed(objective: Objective): void {
            if (this._armedObjective !== objective) {
                logger.log(`<R> Destroyed objective does not match the armed objective`, LogLevel.Warning);
                return;
            }

            this._roundClock.stop();

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<R> Objective destroyed. Stopped round clock and ending round`, LogLevel.Info);
            }

            this._end();
        }

        public handleSoldierEliminated(unit: Unit): void {
            // Don't end the round if it has already ended or the unit has active soldiers.
            if (this._endTime || unit.activeSoldiers.length) return;

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<R> Unit ${unit.name} has no active soldiers`, LogLevel.Info);
            }

            // Don't end the round if the attacking unit has an armed objective, even if it has no active soldiers.
            if (unit === this._attackingUnit && this._armedObjective) return;

            this._end();
        }

        public get startTime(): number | undefined {
            return this._startTime;
        }

        public get deploymentTime(): number | undefined {
            return this._deploymentTime;
        }

        public get endTime(): number | undefined {
            return this._endTime;
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

        public get winningUnit(): Unit | undefined {
            return this._winningUnit;
        }
    }

    namespace Round {
        export type ObjectivePositions = Objective.Position[];

        export type Params = {
            attackingUnit: Unit;
            defendingUnit: Unit;
            objectivePositions: Round.ObjectivePositions;
            deploymentManager: DeploymentManager;
            delayDuration?: number;
            roundDuration?: number;
            objectiveArmDuration?: number;
            objectiveDefuseDuration?: number;
            objectiveFuseDuration?: number;
            onRoundCountdownSecond?: (seconds: number) => void;
            onRoundEnd: () => Promise<void> | void;
            onDeploymentCountdownSecond?: (seconds: number) => void;
            onDeploymentReleased?: () => Promise<void> | void;
        };
    }

    class Unit {
        private static readonly _UNITS = new Map<number, Unit>();

        public static getUnit(teamId: number): Unit {
            return Unit._UNITS.get(teamId)!;
        }

        public static async flipTeams(teamId1: number, teamId2: number): Promise<void> {
            return new Promise((resolve) => {
                const unit1 = Unit.getUnit(teamId1);
                const unit2 = Unit.getUnit(teamId2);

                if (!unit1) {
                    logger.log(`<U> Unit not found for team ${teamId1}`, LogLevel.Error);
                    return;
                }

                if (!unit2) {
                    logger.log(`<U> Unit not found for team ${teamId2}`, LogLevel.Error);
                    return;
                }

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(
                        `<U> Flipping teams ${unit1.name} (${teamId1}) and ${unit2.name} (${teamId2})...`,
                        LogLevel.Info
                    );
                }

                mod.SwitchTeams(unit1._team, unit2._team);
                unit1._team = mod.GetTeam((unit1._teamId = teamId2));
                unit2._team = mod.GetTeam((unit2._teamId = teamId1));

                Unit._UNITS.set(teamId2, unit1);
                Unit._UNITS.set(teamId1, unit2);

                Timers.setTimeout(() => {
                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(
                            `<U> Teams ${unit1.name} (${teamId1}) and ${unit2.name} (${teamId2}) flipped`,
                            LogLevel.Info
                        );
                    }

                    resolve();
                }, FLIP_TEAMS_BUFFER_DURATION_MS);
            });
        }

        public static switchUnit(player: mod.Player, unit: Unit): void {
            // TODO: Somehow make sure the unit size is not exceeded.
            const soldier = Soldier.getSoldier(player);

            if (!soldier) return;

            // TODO: Logging

            const currentUnit = soldier.unit;

            // TODO: Need to undeploy the player first, and also ensure it can only happen at appropriate times.

            mod.SetTeam(player, unit.team);
            currentUnit._SOLDIERS.delete(soldier);
            unit._SOLDIERS.add(soldier);
        }

        static {
            Events.OnPlayerJoinGame.subscribe((player: mod.Player) => {
                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<U> P-${mod.GetObjId(player)} joined game`, LogLevel.Info);
                }

                const teamId = mod.GetObjId(mod.GetTeam(player));
                const unit = Unit.getUnit(teamId);

                if (!unit) {
                    logger.log(`<U> Unit not found for team ${teamId}`, LogLevel.Error);
                    return;
                }

                const callbacks: Soldier.Callbacks = {
                    onStateChange: (state) => unit._handleSoldierStateChange(soldier, state),
                };

                const soldier = new Soldier(player, unit, callbacks, SKIP_MAN_DOWN);

                unit._SOLDIERS.add(soldier);
            });
        }

        public constructor(name: string, teamId: number, callbacks: Unit.Callbacks) {
            this._name = name;
            this._teamId = teamId;
            this._team = mod.GetTeam(teamId);
            this._onSoldierEliminated = callbacks?.onSoldierEliminated;

            Unit._UNITS.set(teamId, this);
        }

        private readonly _SOLDIERS = new Set<Soldier>();

        private _name: string;
        private _team: mod.Team;
        private _teamId: number;
        private _onSoldierEliminated?: () => void;

        private _handleSoldierStateChange(soldier: Soldier, state: Soldier.State): void {
            if (state === Soldier.State.Left) {
                this._SOLDIERS.delete(soldier);
                this._onSoldierEliminated?.();
            } else if (state === Soldier.State.Undeployed) {
                this._onSoldierEliminated?.();
            }
        }

        public get name(): string {
            return this._name;
        }

        public get team(): mod.Team {
            return this._team;
        }

        public get teamId(): number {
            return this._teamId;
        }

        public get soldierCount(): number {
            return this._SOLDIERS.size;
        }

        public get activeSoldiers(): Soldier[] {
            return Array.from(this._SOLDIERS).filter(
                (soldier) => soldier.state === Soldier.State.NotYetDeployed || soldier.state === Soldier.State.Deployed
            );
        }
    }

    namespace Unit {
        export type Callbacks = {
            onSoldierEliminated?: () => Promise<void> | void;
        };
    }

    class Soldier {
        private static readonly _SOLDIERS = new Map<number, Soldier>();

        public static getSoldier(player: mod.Player): Soldier | undefined {
            return Soldier._SOLDIERS.get(mod.GetObjId(player));
        }

        public static setStateForAll(state: Soldier.State): void {
            for (const soldier of Soldier._SOLDIERS.values()) {
                soldier.state = state;
            }
        }

        static {
            Events.OnPlayerDeployed.subscribe((player: mod.Player) => {
                const playerId = mod.GetObjId(player);

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<S> P-${playerId} deployed`, LogLevel.Info);
                }

                const soldier = Soldier._SOLDIERS.get(playerId);

                if (!soldier) return;

                soldier._handleDeployed();
            });

            Events.OnPlayerUndeploy.subscribe((player: mod.Player) => {
                const playerId = mod.GetObjId(player);

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<S> P-${playerId} undeployed`, LogLevel.Info);
                }

                const soldier = Soldier._SOLDIERS.get(playerId);

                if (!soldier) return;

                soldier._handleUndeploy();
            });

            Events.OnPlayerLeaveGame.subscribe((playerId: number) => {
                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<S> P-${playerId} left game`, LogLevel.Info);
                }

                const soldier = Soldier._SOLDIERS.get(playerId);

                if (!soldier) return;

                Soldier._SOLDIERS.delete(playerId);

                soldier._handleLeave();
            });
        }

        public constructor(player: mod.Player, unit: Unit, callbacks: Soldier.Callbacks, skipManDown: boolean = false) {
            this._player = player;
            this._playerId = mod.GetObjId(player);
            this._unit = unit;

            this._onStateChange = callbacks?.onStateChange;

            mod.SkipManDown(player, skipManDown);

            Soldier._SOLDIERS.set(this._playerId, this);

            logger.log(`<S> Soldier-${this._playerId} created for ${this._unit.name}`, LogLevel.Info);
        }

        private _player: mod.Player;
        private _playerId: number;
        private _unit: Unit;
        private _state: Soldier.State = Soldier.State.Joined;
        private _onStateChange?: (state: Soldier.State) => void;

        private _handleDeployed(): void {
            this._state = Soldier.State.Deployed;
            this._onStateChange?.(this._state);
        }

        private _handleUndeploy(): void {
            this._state = Soldier.State.Undeployed;
            this._onStateChange?.(this._state);
        }

        private _handleLeave(): void {
            this._state = Soldier.State.Left;
            this._onStateChange?.(this._state);
        }

        public get player(): mod.Player {
            return this._player;
        }

        public get playerId(): number {
            return this._playerId;
        }

        public get unit(): Unit {
            return this._unit;
        }

        public set state(state: Soldier.State) {
            this._onStateChange?.((this._state = state));
        }

        public get state(): Soldier.State {
            return this._state;
        }
    }

    namespace Soldier {
        export type Callbacks = {
            onStateChange?: (state: Soldier.State) => Promise<void> | void;
        };

        export enum State {
            Joined = 'joined',
            NotYetDeployed = 'not-yet-deployed',
            Deployed = 'deployed',
            Undeployed = 'undeployed',
            Left = 'left',
        }
    }

    class Objective {
        public static readonly DEFAULT_FUSE_DURATION = 60; // 60 seconds
        public static readonly DEFAULT_ARM_DURATION = 7; // 7 seconds
        public static readonly DEFAULT_DEFUSE_DURATION = 10; // 10 seconds

        private static readonly _OBJECTIVES = new Map<number, Objective>();

        static {
            Events.OnMCOMArmed.subscribe((mcom: mod.MCOM) => {
                const mcomId = mod.GetObjId(mcom);

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<O> MCOM-${mcomId} armed`, LogLevel.Info);
                }

                const objective = Objective._OBJECTIVES.get(mcomId);

                if (!objective) return;

                objective._handleArmed();
            });

            Events.OnMCOMDefused.subscribe((mcom: mod.MCOM) => {
                const mcomId = mod.GetObjId(mcom);

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<O> MCOM-${mcomId} defused`, LogLevel.Info);
                }

                const objective = Objective._OBJECTIVES.get(mcomId);

                if (!objective) return;

                objective._handleDefused();
            });

            Events.OnMCOMDestroyed.subscribe((mcom: mod.MCOM) => {
                const mcomId = mod.GetObjId(mcom);

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<O> MCOM-${mcomId} destroyed`, LogLevel.Info);
                }

                const objective = Objective._OBJECTIVES.get(mcomId);

                if (!objective) return;

                objective._handleDestroyed();
            });
        }

        public constructor(position: Objective.Position, callbacks?: Objective.Callbacks, options?: Objective.Options) {
            this._mcom = mod.SpawnObject(
                mod.RuntimeSpawn_Common.MCOM,
                toVector(position.x, position.y, position.z),
                toRotationVector(position.orientation)
            ) as mod.MCOM;

            this._onArmed = callbacks?.onArmed;
            this._onDefused = callbacks?.onDefused;
            this._onDestroyed = callbacks?.onDestroyed;

            this._id = mod.GetObjId(this._mcom);
            this._armDuration = options?.armDuration ?? Objective.DEFAULT_ARM_DURATION;
            this._defuseDuration = options?.defuseDuration ?? Objective.DEFAULT_DEFUSE_DURATION;
            this._fuseDuration = options?.fuseDuration ?? Objective.DEFAULT_FUSE_DURATION;

            mod.SetMCOMFuseTime(this._mcom, this._fuseDuration);

            this._enabled = true;

            Objective._OBJECTIVES.set(this._id, this);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `<O> Objective-${this._id} created at <${position.x}, ${position.y}, ${position.z}> (${position.orientation}-deg)`,
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
        private _onArmed?: () => void;
        private _onDefused?: () => void;
        private _onDestroyed?: () => void;

        private _handleArmed(): void {
            this._armedTime = Date.now();
            this._onArmed?.();
        }

        private _handleDefused(): void {
            this._defusedTime = Date.now();
            this._onDefused?.();
        }

        private _handleDestroyed(): void {
            this._destroyedTime = Date.now();
            this._onDestroyed?.();
        }

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

        public disable(): void {
            if (!this._mcom) {
                logger.log(`<O> Objective dose not exist and cannot be disabled`, LogLevel.Warning);
                return;
            }

            mod.EnableGameModeObjective(this._mcom, (this._enabled = false));

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<O> Objective-${this._id} disabled`, LogLevel.Info);
            }
        }

        public remove(): void {
            if (!this._mcom) {
                logger.log(`<O> Objective dose not exist and cannot be removed`, LogLevel.Warning);
                return;
            }

            mod.UnspawnObject(this._mcom);
            Objective._OBJECTIVES.delete(this._id!);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<O> Objective-${this._id} removed`, LogLevel.Info);
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

        export type Callbacks = {
            onArmed?: () => Promise<void> | void;
            onDefused?: () => Promise<void> | void;
            onDestroyed?: () => Promise<void> | void;
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

    const handleSoldierEliminated = (unit: Unit): void => {
        const currentRound = getCurrentRound();

        if (!currentRound) return;

        currentRound.handleSoldierEliminated(unit);
    };

    const ALPHA_UNIT = new Unit('Alpha', 1, { onSoldierEliminated: (): void => handleSoldierEliminated(ALPHA_UNIT) });
    const BRAVO_UNIT = new Unit('Bravo', 2, { onSoldierEliminated: (): void => handleSoldierEliminated(BRAVO_UNIT) });

    type GameState = {
        gameStarted: boolean;
        roundStarted: boolean;
        roundDeploymentReleased: boolean;
        roundEnded: boolean;
        gameEnded: boolean;
        clock: number;
        rounds: Round[];
        scores: Record<string, number>;
    };

    const gameOptions: Options = {
        allowSwitchTeams: ALLOW_SWITCH_TEAMS,
        roundObjectives: [],
        delayDuration: ROUND_DELAY_DURATION,
        roundDuration: ROUNDS_DURATION,
        roundsToWin: ROUNDS_TO_WIN,
        objectiveArmDuration: OBJECTIVE_ARM_DURATION,
        objectiveDefuseDuration: OBJECTIVE_DEFUSE_DURATION,
        objectiveFuseDuration: OBJECTIVE_FUSE_DURATION,
    };

    const [gameState, setGameState] = SolidUI.createStore<GameState>({
        gameStarted: false,
        roundStarted: false,
        roundDeploymentReleased: false,
        roundEnded: false,
        gameEnded: false,
        clock: 0,
        rounds: [],
        scores: {
            [ALPHA_UNIT.name]: 0,
            [BRAVO_UNIT.name]: 0,
        },
    });

    const deploymentManager = FORCE_DEPLOY ? new ForceDeploymentManager() : new SelfDeploymentManager();

    // #endregion

    // #region UI

    class PlayerUI {
        private static readonly _PLAYERS = new Map<number, PlayerUI>();

        static {
            Events.OnPlayerJoinGame.subscribe((player: mod.Player) => {
                const playerId = mod.GetObjId(player);

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<PUI> P-${playerId} joined game`, LogLevel.Info);
                }

                PlayerUI._PLAYERS.set(playerId, new PlayerUI(player));
            });

            Events.OnPlayerLeaveGame.subscribe((playerId: number) => {
                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<PUI> P-${playerId} left game`, LogLevel.Info);
                }

                PlayerUI.delete(playerId);
            });
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

            PlayerUI._PLAYERS.delete(playerUI._playerId);
        }

        public static deleteGameStartUIs(): void {
            for (const playerUI of PlayerUI._PLAYERS.values()) {
                for (const element of playerUI._gameStartElements) {
                    element.delete();
                }
            }
        }

        private constructor(player: mod.Player) {
            this._player = player;
            this._playerId = mod.GetObjId(player);

            if (gameState.rounds.length == 0) {
                this._createGameStartUI();
            }

            this._createStartRoundInfoUI();
            this._createRoundDeploymentUI();
            this._createRoundUI();
            this._createEndRoundInfoUI();
            this._createGameEndUI();

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<PUI> UI created for P-${this._playerId}`, LogLevel.Info);
            }
        }

        private _player: mod.Player;
        private _playerId: number;
        private _gameStartElements: UI.Element[] = [];
        private _roundStartInfoElements: UI.Element[] = [];
        private _roundDeploymentElements: UI.Element[] = [];
        private _roundElements: UI.Element[] = [];
        private _roundEndInfoElements: UI.Element[] = [];
        private _gameEndElements: UI.Element[] = [];

        private _createGameStartUI(): void {
            const container = SolidUI.h(UIContainer, {
                x: 0,
                y: 100,
                width: 400,
                height: 100,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.BF_GREY_4,
                bgAlpha: 0.8,
                bgFill: mod.UIBgFill.Blur,
                visible: () => gameState.gameStarted && gameState.rounds.length == 0,
                receiver: this._player,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 400,
                height: 100,
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.gameStartCountdown, gameState.clock),
            });

            this._gameStartElements.push(container);
        }

        private _createStartRoundInfoUI(): void {
            const container = SolidUI.h(UIContainer, {
                x: 0,
                y: 100,
                width: 400,
                height: 100,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.BF_GREY_4,
                bgAlpha: 0.8,
                bgFill: mod.UIBgFill.Blur,
                visible: () => gameState.gameStarted && gameState.rounds.length > 0 && !gameState.roundStarted,
                receiver: this._player,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 400,
                height: 100,
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () =>
                    mod.Message(
                        mod.stringkeys.searchAndDestroy.roundStartCountdown,
                        gameState.rounds.length,
                        gameState.clock
                    ),
            });

            this._roundStartInfoElements.push(container);
        }

        private _createRoundDeploymentUI(): void {
            const container = SolidUI.h(UIContainer, {
                x: 0,
                y: 100,
                width: 400,
                height: 100,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.BF_GREY_4,
                bgAlpha: 0.8,
                bgFill: mod.UIBgFill.Blur,
                visible: () => gameState.roundStarted && !gameState.roundDeploymentReleased,
                receiver: this._player,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 400,
                height: 100,
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.roundDeploymentCountdown, gameState.clock),
            });

            this._roundDeploymentElements.push(container);
        }

        private _createRoundUI(): void {
            const container = SolidUI.h(UIContainer, {
                x: 0,
                y: 100,
                width: 400,
                height: 100,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.BF_GREY_4,
                bgAlpha: 0.8,
                bgFill: mod.UIBgFill.Blur,
                visible: () => gameState.roundDeploymentReleased && !gameState.roundEnded,
                receiver: this._player,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 400,
                height: 100,
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () =>
                    mod.Message(
                        mod.stringkeys.searchAndDestroy.roundEndCountdown,
                        gameState.rounds.length,
                        gameState.clock
                    ),
            });

            this._roundElements.push(container);
        }

        private _createEndRoundInfoUI(): void {
            const container = SolidUI.h(UIContainer, {
                width: 2520,
                height: 1080,
                bgColor: UI.COLORS.BF_GREY_4,
                bgAlpha: 0.95,
                bgFill: mod.UIBgFill.Blur,
                visible: () => gameState.roundEnded && !gameState.gameEnded,
                receiver: this._player,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 400,
                height: 100,
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.switchingSidesCountdown, gameState.clock),
            });

            this._roundEndInfoElements.push(container);
        }

        private _createGameEndUI(): void {
            const container = SolidUI.h(UIContainer, {
                x: 0,
                y: 100,
                width: 400,
                height: 100,
                anchor: mod.UIAnchor.TopCenter,
                bgColor: UI.COLORS.BF_GREY_4,
                bgAlpha: 0.8,
                bgFill: mod.UIBgFill.Blur,
                visible: () => gameState.gameEnded,
                receiver: this._player,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 400,
                height: 100,
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.gameEndCountdown, gameState.clock),
            });

            this._gameEndElements.push(container);
        }
    }

    // #endregion

    // #region Game Functions

    function getCurrentRound(): Round | undefined {
        return gameState.rounds[gameState.rounds.length - 1];
    }

    function updateClock(seconds: number): void {
        setGameState((s) => {
            s.clock = seconds;
        });
    }

    export function start(options: Options): void {
        if (gameState.gameStarted) return;

        if (options.roundObjectives.length === 0) {
            logger.log(`No objectives provided`, LogLevel.Warning);
            return;
        }

        gameOptions.allowSwitchTeams = options.allowSwitchTeams ?? ALLOW_SWITCH_TEAMS;
        gameOptions.roundObjectives = options.roundObjectives;
        gameOptions.delayDuration = options.delayDuration ?? ROUND_DELAY_DURATION;
        gameOptions.roundDuration = options.roundDuration ?? ROUNDS_DURATION;
        gameOptions.roundsToWin = options.roundsToWin ?? ROUNDS_TO_WIN;
        gameOptions.objectiveArmDuration = options.objectiveArmDuration ?? OBJECTIVE_ARM_DURATION;
        gameOptions.objectiveDefuseDuration = options.objectiveDefuseDuration ?? OBJECTIVE_DEFUSE_DURATION;
        gameOptions.objectiveFuseDuration = options.objectiveFuseDuration ?? OBJECTIVE_FUSE_DURATION;

        setGameState((s) => {
            s.gameStarted = true;
        });

        const gameStartClock = new Clocks.CountDownClock(GAME_START_INFO_DURATION, {
            onComplete: () => {
                logger.log(`gameStartClock onComplete`, LogLevel.Info);
                PlayerUI.deleteGameStartUIs();
                handleNewRound(ALPHA_UNIT, BRAVO_UNIT, gameOptions.roundObjectives.shift()!);
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
            },
        });

        setGameState((s) => {
            s.rounds = [...s.rounds, round];
            s.roundStarted = false;
            s.roundDeploymentReleased = false;
            s.roundEnded = false;
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
        const score = gameState.scores[round.winningUnit!.name] + 1;

        setGameState((s) => {
            s.scores[round.winningUnit!.name] = score;
            s.roundEnded = true;
        });

        if (logger.willLog(LogLevel.Info)) {
            logger.log(`${round.winningUnit!.name} score is now ${score}`, LogLevel.Info);
        }

        const roundEndInfoClock = new Clocks.CountDownClock(ROUND_END_INFO_DURATION, {
            onComplete: () => {
                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`Round ended`, LogLevel.Info);
                }

                if (score >= ROUNDS_TO_WIN) return handleGameEnd();

                const objectivePositions = gameOptions.roundObjectives.shift();

                if (!objectivePositions) return handleGameEnd();

                Unit.flipTeams(ALPHA_UNIT.teamId, BRAVO_UNIT.teamId).then(() => {
                    // Start a new round with the previous defending unit attacking and the previous attacking unit defending.
                    handleNewRound(round.defendingUnit, round.attackingUnit, objectivePositions);
                });
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
        });

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
}
