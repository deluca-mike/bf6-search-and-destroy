import { Clocks } from 'bf6-portal-utils/clocks/index.ts';
import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { SolidUI } from 'bf6-portal-utils/solid-ui/index.ts';

import { UI } from 'bf6-portal-utils/ui/index.ts';
import { UIContainer } from 'bf6-portal-utils/ui/components/container/index.ts';
import { UIText } from 'bf6-portal-utils/ui/components/text/index.ts';
import { UIImage } from 'bf6-portal-utils/ui/components/image/index.ts';
import { UITextButton } from 'bf6-portal-utils/ui/components/text-button/index.ts';

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

    abstract class DeploymentManager {
        public constructor() {
            Events.OnPlayerDeployed.subscribe((player: mod.Player) => {
                if (logger.willLog(LogLevel.Debug)) {
                    logger.log(`<DM> P-${mod.GetObjId(player)} deployed`, LogLevel.Debug);
                }

                this._handleDeployed(player);
            });
        }

        private _players: Map<number, mod.Player> = new Map();
        private _timeout?: number;
        private _deployEnabled: boolean = false;

        private _setAllPlayersDeployEnabled(deployEnabled: boolean): void {
            for (const player of this._players.values()) {
                mod.EnablePlayerDeploy(player, deployEnabled);
            }
        }

        private _handleJoined(player: mod.Player): void {
            mod.SetRedeployTime(player, 0);
            mod.EnablePlayerDeploy(player, this._deployEnabled);
        }

        private _handleDeployed(player: mod.Player): void {
            mod.EnablePlayerDeploy(player, false);
        }

        protected abstract _afterDeployEnabled(): void;

        public get deployEnabled(): boolean {
            return this._deployEnabled;
        }

        public handlePlayerJoinGame(player: mod.Player): void {
            if (logger.willLog(LogLevel.Debug)) {
                logger.log(
                    `<DM> P-${mod.GetObjId(player)} joined on T-${mod.GetObjId(mod.GetTeam(player))}`,
                    LogLevel.Debug
                );
            }

            this._players.set(mod.GetObjId(player), player);

            this._handleJoined(player);
        }

        public handlePlayerLeaveGame(playerId: number): void {
            this._players.delete(playerId);
        }

        public release(timeUntilRelease: number = 0, timeUntilLock?: number): void {
            Timers.clear(this._timeout);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<FDM> Deploying players in ${timeUntilRelease / 1_000}s...`, LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(() => {
                this._setAllPlayersDeployEnabled((this._deployEnabled = true));
                this._afterDeployEnabled();

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Players deployed`, LogLevel.Info);
                }

                if (timeUntilLock === undefined) return;

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, LogLevel.Info);
                }

                this._timeout = Timers.setTimeout(
                    () => {
                        this._setAllPlayersDeployEnabled((this._deployEnabled = false));

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
                this._setAllPlayersDeployEnabled((this._deployEnabled = false));

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Deployment disabled`, LogLevel.Info);
                }

                if (timeUntilRelease === undefined) return;

                if (logger.willLog(LogLevel.Info)) {
                    logger.log(`<FDM> Deploying players in ${timeUntilRelease / 1_000}s...`, LogLevel.Info);
                }

                this._timeout = Timers.setTimeout(() => {
                    this._setAllPlayersDeployEnabled((this._deployEnabled = true));
                    this._afterDeployEnabled();

                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(`<FDM> Players deployed`, LogLevel.Info);
                    }
                }, timeUntilRelease);
            }, timeUntilLock);
        }
    }

    class ForceDeploymentManager extends DeploymentManager {
        protected _afterDeployEnabled(): void {
            mod.DeployAllPlayers();
        }
    }

    class SelfDeploymentManager extends DeploymentManager {
        protected _afterDeployEnabled(): void {}
    }

    // #endregion

    // #region Constants

    const FORCE_DEPLOY = true;
    const ALLOW_SWITCH_TEAMS = true; // true for no revives.
    const SKIP_MAN_DOWN = true;
    const ROUND_DELAY_DURATION = 20;
    const ROUNDS_DURATION = 360;
    const OBJECTIVE_FUSE_DURATION = 60;
    const OBJECTIVE_ARM_DURATION = 7;
    const OBJECTIVE_DEFUSE_DURATION = 10;
    const GAME_START_INFO_DURATION = 30;
    const ROUND_START_INFO_DURATION = 10;
    const ROUND_END_TEARDOWN_DELAY_DURATION = 5;
    const ROUND_END_INFO_DURATION = 10;
    const GAME_END_INFO_DURATION = 10;
    const MAX_PLAYERS_PER_UNIT = 8;

    const GREEN = mod.CreateVector(0.49, 0.81, 0.41); // #7DCE68

    const FRIENDLY_COLOR_BRIGHT = mod.CreateVector(0.471, 0.949, 1.0); // #78F2FF
    const FRIENDLY_COLOR_BACKGROUND = mod.CreateVector(0.471 / 2.5, 0.949 / 2.5, 1.0 / 2.5);
    const FRIENDLY_COLOR_DARK = mod.CreateVector(0.416, 0.599, 0.657); // #6A99A8
    const ENEMY_COLOR_BRIGHT = mod.CreateVector(0.996, 0.561, 0.443); // #FE8F71
    const ENEMY_COLOR_BACKGROUND = mod.CreateVector(0.996 / 2.5, 0.561 / 2.5, 0.443 / 2.5);
    const ENEMY_COLOR_DARK = mod.CreateVector(0.749, 0.498, 0.431); // #BF7F6E

    // #endregion

    // #region Classes

    class Round {
        public static readonly DEFAULT_DELAY_DURATION = 20;
        public static readonly DEFAULT_ROUND_DURATION = 360; // 360 seconds = 6 minutes

        public static currentRound?: Round;

        public static handleSoldierJoined(soldier: Soldier): void {
            // If there is a current round and deployment has already happened, don't do anything.
            if (Round.currentRound?._deploymentTime) return;

            soldier.state = Soldier.State.NotYetDeployed;
        }

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
            this._onArmed = params.onArmed;

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
                onComplete: () => {
                    // Don't let the clock completion call `_end` if an objective is armed, since the destroyed or
                    // disarmed objective event will call `_end` instead.
                    if (this._armedObjective) return;

                    this._end(Round.WinCondition.ObjectivesDefended, this._defendingUnit);
                },
                onSecond: (seconds) => {
                    this._onRoundCountdownSecond?.(seconds);
                },
            });

            Round.currentRound = this;

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
        private _winCondition?: Round.WinCondition;
        private _armedObjective?: Objective;
        private _roundClock: Clocks.CountDownClock;
        private _onRoundCountdownSecond?: (seconds: number) => void;
        private _onRoundEnd: () => Promise<void> | void;
        private _onDeploymentCountdownSecond?: (seconds: number) => void;
        private _onDeploymentReleased?: () => Promise<void> | void;
        private _onArmed?: () => Promise<void> | void;

        public start(): void {
            if (this._startTime) {
                logger.log(`<R> Round already started`, LogLevel.Warning);
                return;
            }

            this._startTime = Date.now();

            Soldier.setStateForAll(Soldier.State.NotYetDeployed);

            const deploymentClock = new Clocks.CountDownClock(this._delayDuration, {
                onComplete: () => {
                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(`<R> Round started`, LogLevel.Info);
                    }

                    this._deploymentTime = Date.now();
                    this._onDeploymentReleased?.();

                    // Release all players for the round duration.
                    this._deploymentManager.release(); // TODO: Consider locking the deployment sooner.

                    this._roundClock.start();
                },
                onSecond: (seconds) => {
                    this._onDeploymentCountdownSecond?.(seconds);
                },
            });

            deploymentClock.start();
        }

        private _end(winCondition: Round.WinCondition, winningUnit: Unit): void {
            if (this._endTime) {
                logger.log(`<R> Round already ended`, LogLevel.Warning);
                return;
            }

            this._endTime = Date.now();
            this._roundClock.stop();
            this._deploymentManager.lock(); // Lock all players from deploying indefinitely.

            this._winCondition = winCondition;
            this._winningUnit = winningUnit;

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `<R> ${winningUnit.teamId === this._attackingUnit.teamId ? 'Attackers' : 'Defenders'} (${winningUnit.name}) won`,
                    LogLevel.Info
                );
            }

            // Disable all objectives.
            for (const otherObjective of this._objectives) {
                otherObjective.disable();
            }

            // Don't undeploy MCOMs and players that are alive abruptly.
            Timers.setTimeout(() => {
                mod.UndeployAllPlayers();
                Soldier.setStateForAll(Soldier.State.Undeployed);

                while (this._objectives.length > 0) {
                    this._objectives.pop()?.remove();
                }

                if (logger.willLog(LogLevel.Debug)) {
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

            this._armedObjective = objective;
            this._onArmed?.();

            // Disable all other objectives.
            for (const otherObjective of this._objectives) {
                if (otherObjective === objective) continue;

                otherObjective.disable();
            }

            // Round no longer bound by default timer as there is an active objective.
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

            this._end(Round.WinCondition.ObjectiveDisarmed, this._defendingUnit);
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

            this._end(Round.WinCondition.ObjectiveDestroyed, this._attackingUnit);
        }

        public handleSoldierEliminated(soldier: Soldier): void {
            // Don't end the round if it has already ended or the unit has active soldiers.
            if (this._endTime || soldier.unit.activeSoldiers.length) return;

            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<R> Unit ${soldier.unit.name} has no active soldiers`, LogLevel.Info);
            }

            // Don't end the round if the attacking unit has an armed objective, even if it has no active soldiers.
            if (soldier.unit === this._attackingUnit && this._armedObjective) return;

            const winningUnit =
                soldier.unit.teamId === this._attackingUnit.teamId ? this._defendingUnit : this._attackingUnit;

            this._end(Round.WinCondition.EnemyEliminated, winningUnit);
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

        public get winCondition(): Round.WinCondition | undefined {
            return this._winCondition;
        }
    }

    namespace Round {
        export enum WinCondition {
            ObjectiveDestroyed = 'objectiveDestroyed',
            ObjectiveDisarmed = 'objectiveDisarmed',
            ObjectivesDefended = 'objectivesDefended',
            EnemyEliminated = 'enemyEliminated',
        }

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
            onArmed?: () => Promise<void> | void;
        };
    }

    class Unit {
        private static readonly _UNITS = new Map<number, Unit>();

        private static readonly _SOLDIERS_UNIT_MAP = new Map<number, Unit>();

        /**
         * Since `mod.SwitchTeams` is broken for anything other that switch team 0 with team 1, we first need to move
         * one player from `unit1` to team 0, then move one of each player from `unit2` and `unit1` to the other team,
         * and then move the first player from team 0 to `unit2`.
         */
        private static async _switchSides(unit1: Unit, unit2: Unit): Promise<void> {
            return new Promise((resolve) => {
                const soldiersOfUnit1 = Array.from(unit1._SOLDIERS);
                const soldiersOfUnit2 = Array.from(unit2._SOLDIERS);

                for (let i = 0; i < MAX_PLAYERS_PER_UNIT; ++i) {
                    const soldierOfUnit1 = soldiersOfUnit1[i];

                    if (soldierOfUnit1) {
                        mod.SetTeam(soldierOfUnit1.player, i === 0 ? mod.GetTeam(0) : unit2.team);
                    }

                    const soldierOfUnit2 = soldiersOfUnit2[i];

                    if (soldierOfUnit2) {
                        mod.SetTeam(soldierOfUnit2.player, unit1.team);
                    }
                }

                const firstSoldierOfUnit1 = soldiersOfUnit1[0];

                Timers.setTimeout(() => {
                    if (firstSoldierOfUnit1) {
                        mod.SetTeam(firstSoldierOfUnit1.player, unit2.team);
                    }

                    Timers.setTimeout(resolve, 1_000);
                }, 1_000);
            });
        }

        public static getUnitByTeamId(teamId: number): Unit {
            return Unit._UNITS.get(teamId)!;
        }

        public static getUnitForPlayerId(playerId: number): Unit {
            return Unit._SOLDIERS_UNIT_MAP.get(playerId)!;
        }

        public static async flipTeams(teamId1: number, teamId2: number): Promise<void> {
            const unit1 = Unit.getUnitByTeamId(teamId1);
            const unit2 = Unit.getUnitByTeamId(teamId2);

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

            await Unit._switchSides(unit1, unit2);

            unit1._team = mod.GetTeam((unit1._teamId = teamId2));
            unit2._team = mod.GetTeam((unit2._teamId = teamId1));

            Unit._UNITS.set(teamId2, unit1);
            Unit._UNITS.set(teamId1, unit2);

            if (logger.willLog(LogLevel.Info)) {
                logger.log(
                    `<U> Teams ${unit1.name} (${teamId1}) and ${unit2.name} (${teamId2}) flipped`,
                    LogLevel.Info
                );
            }
        }

        public static switchUnit(soldier: Soldier, unit: Unit): boolean {
            const currentUnit = Unit._SOLDIERS_UNIT_MAP.get(soldier.playerId);

            if (!currentUnit) {
                logger.log(`<U> Unit not found for P-${soldier.playerId}`, LogLevel.Error);
                return false;
            }

            if (unit.soldierCount >= 8) {
                logger.log(`<U> Unit ${unit.name} already has ${unit.soldierCount} soldiers`, LogLevel.Warning);
                return false;
            }

            logger.log(
                `<U> Switching unit for P-${soldier.playerId} from ${currentUnit.name} to ${unit.name}`,
                LogLevel.Info
            );

            // TODO: If this can happen after the game started, need to undeploy the player first.
            mod.SetTeam(soldier.player, unit.team);

            currentUnit._SOLDIERS.delete(soldier);
            unit._SOLDIERS.add(soldier);
            Unit._SOLDIERS_UNIT_MAP.set(soldier.playerId, unit);

            return true;
        }

        public static handlePlayerJoinGame(player: mod.Player): void {
            const teamId = mod.GetObjId(mod.GetTeam(player));

            if (logger.willLog(LogLevel.Debug)) {
                logger.log(`<U> P-${mod.GetObjId(player)} joined game on T-${teamId}`, LogLevel.Debug);
            }

            const unit = Unit.getUnitByTeamId(teamId);

            if (!unit) {
                logger.log(`<U> Unit not found for team ${teamId}`, LogLevel.Error);
                return;
            }

            const callbacks: Soldier.Callbacks = {
                onStateChange: (state) => unit._handleSoldierStateChange(soldier, state),
            };

            const soldier = new Soldier(player, callbacks, SKIP_MAN_DOWN);

            unit._SOLDIERS.add(soldier);
            Unit._SOLDIERS_UNIT_MAP.set(soldier.playerId, unit);

            unit._handleSoldierStateChange(soldier, soldier.state);
        }

        public constructor(name: string, teamId: number, callbacks: Unit.Callbacks) {
            this._name = name;
            this._teamId = teamId;
            this._team = mod.GetTeam(teamId);
            this._onSoldierStateChange = callbacks?.onSoldierStateChange;

            Unit._UNITS.set(teamId, this);
        }

        private readonly _SOLDIERS = new Set<Soldier>();

        private _name: string;
        private _team: mod.Team;
        private _teamId: number;
        private _onSoldierStateChange?: (soldier: Soldier) => void;

        private _handleSoldierStateChange(soldier: Soldier, state: Soldier.State): void {
            if (state === Soldier.State.Left) {
                this._SOLDIERS.delete(soldier);
            }

            this._onSoldierStateChange?.(soldier);
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
            onSoldierStateChange?: (soldier: Soldier) => Promise<void> | void;
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

        public static handlePlayerLeaveGame(playerId: number): void {
            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<S> P-${playerId} left game`, LogLevel.Info);
            }

            const soldier = Soldier._SOLDIERS.get(playerId);

            if (!soldier) return;

            Soldier._SOLDIERS.delete(playerId);

            soldier._handleLeave();
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

            Events.subscribe(
                SKIP_MAN_DOWN ? Events.Type.OnPlayerDied : Events.Type.OnPlayerUndeploy,
                (player: mod.Player) => {
                    const playerId = mod.GetObjId(player);

                    if (logger.willLog(LogLevel.Info)) {
                        logger.log(`<S> P-${playerId} eliminated`, LogLevel.Info);
                    }

                    const soldier = Soldier._SOLDIERS.get(playerId);

                    if (!soldier) return;

                    soldier._handleEliminated();
                }
            );
        }

        public constructor(player: mod.Player, callbacks: Soldier.Callbacks, skipManDown: boolean = false) {
            this._player = player;
            this._playerId = mod.GetObjId(player);

            this._onStateChange = callbacks?.onStateChange;

            mod.SkipManDown(player, skipManDown);

            Soldier._SOLDIERS.set(this._playerId, this);

            logger.log(`<S> Soldier-${this._playerId} created`, LogLevel.Info);
        }

        private _player: mod.Player;
        private _playerId: number;
        private _state: Soldier.State = Soldier.State.Joined;
        private _onStateChange?: (state: Soldier.State) => void;

        private _handleDeployed(): void {
            this._state = Soldier.State.Deployed;
            this._onStateChange?.(this._state);
        }

        private _handleEliminated(): void {
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
            return Unit.getUnitForPlayerId(this.playerId);
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

        private static readonly _OBJECTIVE_ONGOING_IDS = new Set<number>();

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
        objectiveArmDuration?: number;
        objectiveDefuseDuration?: number;
        objectiveFuseDuration?: number;
    };

    const handleSoldierStateChange = (unit: Unit, soldier: Soldier): void => {
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
                playPlayerCountLowVoiceOvers(unit);
            }
        }

        setGameState((s) => {
            s.activePlayers[unit.name] = unit.activeSoldiers.length;
        });
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

    type GameState = {
        gameStarted: boolean;
        roundStarted: boolean;
        roundDeploymentReleased: boolean;
        roundEnded: boolean;
        gameEnded: boolean;
        resetting: boolean;
        objectiveArmed: boolean;
        winningTeamId?: number;
        winCondition?: Round.WinCondition;
        clock: number;
        currentRoundId: number;
        totalRounds: number;
        scores: Record<string, number>;
        activePlayers: Record<string, number>;
        playerMap: Record<number, string | undefined>;
    };

    const [gameState, setGameState] = SolidUI.createStore<GameState>({
        gameStarted: false,
        roundStarted: false,
        roundDeploymentReleased: false,
        roundEnded: false,
        gameEnded: false,
        resetting: false,
        objectiveArmed: false,
        winningTeamId: undefined,
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
    });

    const deploymentManager = FORCE_DEPLOY ? new ForceDeploymentManager() : new SelfDeploymentManager();

    const switchUnit = (player: mod.Player): void => {
        const soldier = Soldier.getSoldier(player);

        if (!soldier) return;

        const unit = soldier.unit === ALPHA_UNIT ? BRAVO_UNIT : ALPHA_UNIT;

        if (!Unit.switchUnit(soldier, unit)) return;

        setGameState((s) => {
            s.playerMap[soldier.playerId] = unit.name;
            s.activePlayers[ALPHA_UNIT.name] = ALPHA_UNIT.activeSoldiers.length;
            s.activePlayers[BRAVO_UNIT.name] = BRAVO_UNIT.activeSoldiers.length;
        });
    };

    // #endregion

    // #region UI

    class PlayerUI {
        private static readonly _PLAYERS = new Map<number, PlayerUI>();

        public static handlePlayerJoinGame(player: mod.Player): void {
            const playerId = mod.GetObjId(player);

            if (logger.willLog(LogLevel.Debug)) {
                logger.log(`<PUI> P-${playerId} joined game on T-${mod.GetObjId(mod.GetTeam(player))}`, LogLevel.Debug);
            }

            if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
                PlayerUI._PLAYERS.set(playerId, new PlayerUI(player));
            }
        }

        public static handlePlayerLeaveGame(playerId: number): void {
            if (logger.willLog(LogLevel.Info)) {
                logger.log(`<PUI> P-${playerId} left game`, LogLevel.Info);
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

        private constructor(player: mod.Player) {
            this._player = player;
            this._playerId = mod.GetObjId(player);

            if (!gameState.currentRoundId) {
                this._createGameStartUI();
            }

            this._createStartRoundInfoUI();
            this._createRoundDeploymentUI();
            this._createScoreUI();
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
        private _scoreElements: UI.Element[] = [];
        private _roundEndInfoElements: UI.Element[] = [];
        private _gameEndElements: UI.Element[] = [];

        private _createGameStartUI(): void {
            // NOTE: No ned to memo the messages in here as they will be deleted once the game starts.
            const visible = SolidUI.createMemo(() => gameState.gameStarted && !gameState.currentRoundId);

            const gameMode = SolidUI.h(UIText, {
                x: 155,
                y: 130,
                width: 500,
                height: 30,
                anchor: mod.UIAnchor.TopLeft,
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.gameMode, gameState.totalRounds),
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
                    gameState.playerMap[this._playerId] === ALPHA_UNIT.name
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
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.switchTeams, gameState.clock),
                textSize: 30,
                textColor: UI.COLORS.WHITE,
                bgColor: UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                enabled: SolidUI.createMemo(() => {
                    return (
                        gameOptions.allowSwitchTeams &&
                        visible() &&
                        gameState.activePlayers[
                            gameState.playerMap[this._playerId] === ALPHA_UNIT.name ? BRAVO_UNIT.name : ALPHA_UNIT.name
                        ] < 8
                    );
                }),
                uiInputModeWhenVisible: true,
                visible: () => gameOptions.allowSwitchTeams && visible(),
                onClick: () => switchUnit(this._player),
                receiver: this._player,
            });

            this._gameStartElements.push(switchTeamsButton);
        }

        private _createStartRoundInfoUI(): void {
            const isAttacking = SolidUI.createMemo(() => {
                if (!gameState.currentRoundId || !Round.currentRound) return false;

                const unitName = gameState.playerMap[this._playerId];

                if (!unitName) return false;

                return Round.currentRound.attackingUnit.name === unitName;
            });

            const container = SolidUI.h(UIContainer, {
                width: 1000,
                height: 550,
                bgFill: mod.UIBgFill.None,
                visible: SolidUI.createMemo(
                    () => gameState.gameStarted && gameState.currentRoundId > 0 && !gameState.roundStarted
                ),
                receiver: this._player,
            });

            new UIContainer({
                parent: container,
                width: 500,
                height: 300,
                anchor: mod.UIAnchor.TopLeft,
                bgColor: FRIENDLY_COLOR_DARK,
                bgAlpha: 0.9,
                bgFill: mod.UIBgFill.GradientRight,
            });

            new UIContainer({
                parent: container,
                width: 500,
                height: 300,
                anchor: mod.UIAnchor.TopRight,
                bgColor: FRIENDLY_COLOR_DARK,
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
                textColor: FRIENDLY_COLOR_BRIGHT,
                bgFill: mod.UIBgFill.None,
                message: () => mod.Message(mod.stringkeys.searchAndDestroy.round, gameState.currentRoundId),
            });

            SolidUI.h(UIText, {
                parent: container,
                y: 200,
                width: 1000,
                height: 80,
                anchor: mod.UIAnchor.TopCenter,
                textSize: 80,
                textColor: FRIENDLY_COLOR_BRIGHT,
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
                    mod.Message(mod.stringkeys.searchAndDestroy.threshold, Math.ceil(gameState.totalRounds / 2)),
            });

            this._roundEndInfoElements.push(container);
        }

        private _createRoundDeploymentUI(): void {
            const visible = SolidUI.createMemo(() => gameState.roundStarted && !gameState.roundDeploymentReleased);

            const countdown = SolidUI.h(UIText, {
                x: 69,
                y: 550,
                width: 342,
                height: 100,
                anchor: mod.UIAnchor.BottomRight,
                message: () =>
                    mod.Message(
                        mod.stringkeys.searchAndDestroy.roundDeploymentCountdown,
                        visible() ? gameState.clock : 0
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

        private _createTeamSquare(parent: UIContainer, unit: Unit): void {
            const isOnLeft = SolidUI.createMemo(() => {
                const unitName = gameState.playerMap[this._playerId];

                if (!unitName) return false;

                return unitName === unit.name;
            });

            const color = () => (isOnLeft() ? FRIENDLY_COLOR_BRIGHT : ENEMY_COLOR_BRIGHT);
            const background = () => (isOnLeft() ? FRIENDLY_COLOR_BACKGROUND : ENEMY_COLOR_BACKGROUND);

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
                message: () => mod.Message(gameState.scores[unit.name]),
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
                message: () => mod.Message(gameState.activePlayers[unit.name]),
            });
        }

        private _createScoreUI(): void {
            const container = SolidUI.h(UIContainer, {
                y: 80,
                width: 600,
                height: 104,
                anchor: mod.UIAnchor.TopCenter,
                bgFill: mod.UIBgFill.None,
                visible: SolidUI.createMemo(() => gameState.gameStarted && !gameState.gameEnded),
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

            const isInDeploymentScreen = SolidUI.createMemo(() => !gameState.roundDeploymentReleased);
            const isObjectiveArmed = SolidUI.createMemo(() => !gameState.roundEnded && gameState.objectiveArmed);

            SolidUI.h(UIText, {
                parent: clockContainer,
                width: 96,
                height: 30,
                textSize: 18,
                textColor: () =>
                    isInDeploymentScreen() ? GREEN : isObjectiveArmed() ? ENEMY_COLOR_BRIGHT : UI.COLORS.WHITE,
                bgColor: () =>
                    isInDeploymentScreen() ? GREEN : isObjectiveArmed() ? ENEMY_COLOR_BRIGHT : UI.COLORS.WHITE,
                bgAlpha: 1,
                bgFill: mod.UIBgFill.OutlineThin,
                message: () => {
                    const seconds = gameState.clock % 60;

                    return mod.Message(
                        mod.stringkeys.searchAndDestroy.clock,
                        Math.floor(gameState.clock / 60),
                        Math.floor(seconds / 10),
                        seconds % 10
                    );
                },
            });

            this._createTeamSquare(container, ALPHA_UNIT);
            this._createTeamSquare(container, BRAVO_UNIT);

            this._scoreElements.push(container);
        }

        private _createEndRoundInfoUI(): void {
            const visible = SolidUI.createMemo(
                () =>
                    gameState.roundEnded &&
                    !gameState.gameEnded &&
                    gameState.winningTeamId !== undefined &&
                    !gameState.resetting
            );

            const isWinner = SolidUI.createMemo(() => {
                if (!visible()) return false;

                const unitName = gameState.playerMap[this._playerId];

                if (!unitName) return false;

                // visible() ensures that gameState.winningTeamId is not undefined.
                return Unit.getUnitByTeamId(gameState.winningTeamId!).name === unitName;
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
                bgColor: () => (isWinner() ? FRIENDLY_COLOR_DARK : ENEMY_COLOR_DARK),
                bgAlpha: 0.9,
                bgFill: mod.UIBgFill.GradientRight,
            });

            SolidUI.h(UIContainer, {
                parent: container,
                width: 960,
                height: 300,
                anchor: mod.UIAnchor.TopRight,
                bgColor: () => (isWinner() ? FRIENDLY_COLOR_DARK : ENEMY_COLOR_DARK),
                bgAlpha: 0.9,
                bgFill: mod.UIBgFill.GradientLeft,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 1920,
                height: 300,
                anchor: mod.UIAnchor.TopCenter,
                textSize: 240,
                textColor: () => (isWinner() ? FRIENDLY_COLOR_BRIGHT : ENEMY_COLOR_BRIGHT),
                bgFill: mod.UIBgFill.None,
                message: () =>
                    mod.Message(
                        isWinner()
                            ? mod.stringkeys.searchAndDestroy.roundWon
                            : mod.stringkeys.searchAndDestroy.roundLost
                    ),
            });

            SolidUI.h(UIText, {
                parent: container,
                y: 300,
                width: 1920,
                height: 100,
                anchor: mod.UIAnchor.TopCenter,
                textSize: 40,
                textColor: () => (isWinner() ? FRIENDLY_COLOR_BRIGHT : ENEMY_COLOR_BRIGHT),
                bgFill: mod.UIBgFill.None,
                message: () =>
                    mod.Message(
                        isWinner()
                            ? mod.stringkeys.searchAndDestroy.winReasons[gameState.winCondition ?? 'enemiesEliminated']
                            : mod.stringkeys.searchAndDestroy.loseReasons[gameState.winCondition ?? 'enemiesEliminated']
                    ),
            });

            this._roundEndInfoElements.push(container);

            const nextRoundCountdownVisible = SolidUI.createMemo(() => {
                if (!visible()) return false;

                // visible() ensures that gameState.winningTeamId is not undefined.
                return (
                    gameState.scores[Unit.getUnitByTeamId(gameState.winningTeamId!).name] <
                    Math.ceil(gameState.totalRounds / 2)
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
                        gameState.currentRoundId + 1,
                        gameState.totalRounds,
                        gameState.clock
                    ),
                receiver: this._player,
            });

            this._roundEndInfoElements.push(nextRoundCountdown);
        }

        private _createGameEndUI(): void {
            const visible = SolidUI.createMemo(() => gameState.gameEnded && gameState.winningTeamId !== undefined);

            const isWinner = SolidUI.createMemo(() => {
                if (!visible()) return false;

                const unitName = gameState.playerMap[this._playerId];

                if (!unitName) return false;

                // visible() ensures that gameState.winningTeamId is not undefined.
                return Unit.getUnitByTeamId(gameState.winningTeamId!).name === unitName;
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
                bgColor: () => (isWinner() ? FRIENDLY_COLOR_DARK : ENEMY_COLOR_DARK),
                bgAlpha: 0.9,
                bgFill: mod.UIBgFill.GradientRight,
            });

            SolidUI.h(UIContainer, {
                parent: container,
                width: 960,
                height: 300,
                anchor: mod.UIAnchor.TopRight,
                bgColor: () => (isWinner() ? FRIENDLY_COLOR_DARK : ENEMY_COLOR_DARK),
                bgAlpha: 0.9,
                bgFill: mod.UIBgFill.GradientLeft,
            });

            SolidUI.h(UIText, {
                parent: container,
                width: 1920,
                height: 300,
                anchor: mod.UIAnchor.TopCenter,
                textSize: 240,
                textColor: () => (isWinner() ? FRIENDLY_COLOR_BRIGHT : ENEMY_COLOR_BRIGHT),
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
                textColor: () => (isWinner() ? FRIENDLY_COLOR_BRIGHT : ENEMY_COLOR_BRIGHT),
                bgFill: mod.UIBgFill.None,
                message: () => {
                    // visible() ensures that gameState.winningTeamId is not undefined.
                    const score = visible() ? gameState.scores[Unit.getUnitByTeamId(gameState.winningTeamId!).name] : 0;

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
                    mod.Message(mod.stringkeys.searchAndDestroy.gameEndCountdown, visible() ? gameState.clock : 0),
                receiver: this._player,
            });

            this._gameEndElements.push(gameEndCountdown);
        }
    }

    // #endregion

    // #region Scoreboard

    class Scoreboard {
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

    namespace Scoreboard {
        export type Score = {
            kills: number;
            assists: number;
            deaths: number;
        };
    }

    // #endregion

    // #region Game Functions

    const voiceOverModules: Record<string, mod.VO> = {};

    function checkTimeLeftForVoiceOver(seconds: number, targetSeconds: number): boolean {
        return (
            seconds === targetSeconds && (!gameState.objectiveArmed || gameOptions.objectiveFuseDuration !== seconds)
        );
    }

    function getVoiceOverTimeEvent(seconds: number): mod.VoiceOverEvents2D | undefined {
        if (checkTimeLeftForVoiceOver(seconds, 120)) return mod.VoiceOverEvents2D.Time120Left;
        if (checkTimeLeftForVoiceOver(seconds, 60)) return mod.VoiceOverEvents2D.Time60Left;
        if (checkTimeLeftForVoiceOver(seconds, 30)) return mod.VoiceOverEvents2D.Time30Left;
        return undefined;
    }

    function playVoiceOver(unit: Unit, voiceOverEvent: mod.VoiceOverEvents2D): void {
        const voiceOverModule = voiceOverModules[unit.name];

        if (!voiceOverModule) return;

        mod.PlayVO(voiceOverModule, voiceOverEvent, mod.VoiceOverFlags.Alpha, unit.team);
    }

    function playVoiceOvers(voiceOverEvent?: mod.VoiceOverEvents2D): void {
        if (!voiceOverEvent) return;

        playVoiceOver(ALPHA_UNIT, voiceOverEvent);
        playVoiceOver(BRAVO_UNIT, voiceOverEvent);
    }

    function playTimeLeftVoiceOvers(seconds: number): void {
        if (!Round.currentRound) return;

        if (seconds === 20) {
            if (gameState.objectiveArmed) {
                playVoiceOver(Round.currentRound?.defendingUnit, mod.VoiceOverEvents2D.TimeLow);
            } else {
                playVoiceOver(Round.currentRound?.attackingUnit, mod.VoiceOverEvents2D.TimeLow);
            }

            return;
        }

        playVoiceOvers(getVoiceOverTimeEvent(seconds));
    }

    function playRoundStartVoiceOvers(): void {
        playVoiceOvers(mod.VoiceOverEvents2D.RoundStartGeneric);
    }

    function playSwitchSidesVoiceOvers(): void {
        playVoiceOvers(mod.VoiceOverEvents2D.RoundSwitchSides);
    }

    function playLastRoundVoiceOvers(): void {
        playVoiceOvers(mod.VoiceOverEvents2D.RoundLastRound);
    }

    function playGameEndVoiceOvers(): void {
        if (!gameState.winningTeamId) return;

        const winningUnit = gameState.winningTeamId === ALPHA_UNIT.teamId ? ALPHA_UNIT : BRAVO_UNIT;
        const losingUnit = gameState.winningTeamId === ALPHA_UNIT.teamId ? BRAVO_UNIT : ALPHA_UNIT;

        playVoiceOver(winningUnit, mod.VoiceOverEvents2D.GlobalEOMVictory);
        playVoiceOver(losingUnit, mod.VoiceOverEvents2D.GlobalEOMDefeat);
    }

    function playPlayerCountLowVoiceOvers(unitWithLowPlayerCount: Unit): void {
        const otherUnit = unitWithLowPlayerCount === ALPHA_UNIT ? BRAVO_UNIT : ALPHA_UNIT;
        playVoiceOver(unitWithLowPlayerCount, mod.VoiceOverEvents2D.PlayerCountFriendlyLow);
        playVoiceOver(otherUnit, mod.VoiceOverEvents2D.PlayerCountEnemyLow);
    }

    function playMCOMArmedVoiceOvers(): void {
        const currentRound = Round.currentRound;

        if (!currentRound) return;

        playVoiceOver(currentRound.attackingUnit, mod.VoiceOverEvents2D.MComArmFriendly);
        playVoiceOver(currentRound.defendingUnit, mod.VoiceOverEvents2D.MComArmEnemy);
    }

    function playRoundEndVoiceOvers(): void {
        if (!gameState.winningTeamId || !gameState.winCondition) return;

        const winningUnit = gameState.winningTeamId === ALPHA_UNIT.teamId ? ALPHA_UNIT : BRAVO_UNIT;
        const losingUnit = gameState.winningTeamId === ALPHA_UNIT.teamId ? BRAVO_UNIT : ALPHA_UNIT;

        if (gameState.winCondition === Round.WinCondition.EnemyEliminated) {
            playVoiceOver(winningUnit, mod.VoiceOverEvents2D.RoundEndFriendlyKills);
            playVoiceOver(losingUnit, mod.VoiceOverEvents2D.RoundEndEnemyKills);
        } else if (gameState.winCondition === Round.WinCondition.ObjectiveDestroyed) {
            playVoiceOver(winningUnit, mod.VoiceOverEvents2D.MComDestroyedFriendly);
            playVoiceOver(losingUnit, mod.VoiceOverEvents2D.MComDestroyedEnemy);
        } else if (gameState.winCondition === Round.WinCondition.ObjectiveDisarmed) {
            playVoiceOver(winningUnit, mod.VoiceOverEvents2D.MComDefuseFriendly);
            playVoiceOver(losingUnit, mod.VoiceOverEvents2D.MComDefuseEnemy);
        } else if (gameState.winCondition === Round.WinCondition.ObjectivesDefended) {
            playVoiceOver(winningUnit, mod.VoiceOverEvents2D.RoundEndFriendlyCapture);
            playVoiceOver(losingUnit, mod.VoiceOverEvents2D.RoundEndEnemyCapture);
        }
    }

    function updateClock(seconds: number): void {
        setGameState((s) => {
            s.clock = seconds;
        });

        playTimeLeftVoiceOvers(seconds);
    }

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

        voiceOverModules[ALPHA_UNIT.name] = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, 0, 0)
        ) as mod.VO;

        voiceOverModules[BRAVO_UNIT.name] = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(0, 0, 0)
        ) as mod.VO;

        setGameState((s) => {
            s.gameStarted = true;
            s.totalRounds = gameOptions.roundObjectives.length;
        });

        logger.log(`Game starting in ${GAME_START_INFO_DURATION}s...`, LogLevel.Info);

        const gameStartClock = new Clocks.CountDownClock(GAME_START_INFO_DURATION, {
            onComplete: () => {
                PlayerUI.deleteGameStartUIs();
                handleNewRound(ALPHA_UNIT, BRAVO_UNIT, gameOptions.roundObjectives.shift()!);
                playSwitchSidesVoiceOvers();
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
                    playLastRoundVoiceOvers();
                } else {
                    playRoundStartVoiceOvers();
                }
            },
            onArmed: () => {
                setGameState((s) => {
                    s.objectiveArmed = true;
                });

                playMCOMArmedVoiceOvers();
            },
        });

        setGameState((s) => {
            s.roundStarted = false;
            s.roundDeploymentReleased = false;
            s.roundEnded = false;
            s.objectiveArmed = false;
            s.winCondition = undefined;
            s.winningTeamId = undefined;
            s.currentRoundId = s.currentRoundId + 1;
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
            s.winningTeamId = winningUnit.teamId;
            s.winCondition = round.winCondition;
        });

        playRoundEndVoiceOvers();

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
                    playSwitchSidesVoiceOvers();

                    await Unit.flipTeams(ALPHA_UNIT.teamId, BRAVO_UNIT.teamId);

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
            s.winningTeamId = winningUnit.teamId;
            s.winCondition = undefined;
        });

        playGameEndVoiceOvers();

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
            PlayerUI.handlePlayerJoinGame(player);
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
