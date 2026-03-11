import { Clocks } from 'bf6-portal-utils/clocks/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';

import { DeploymentManager } from './deployment-manager.ts';
import { Objective } from './objective.ts';
import { Soldier } from './soldier.ts';
import { Unit } from './unit.ts';

export class Round {
    private static readonly _DEFAULT_DELAY_DURATION = 20;
    private static readonly _DEFAULT_ROUND_DURATION = 360; // 360 seconds = 6 minutes

    private static readonly _OBJECTIVE_FUSE_DURATION = 60;
    private static readonly _OBJECTIVE_ARM_DURATION = 7;
    private static readonly _OBJECTIVE_DEFUSE_DURATION = 10;

    private static readonly _ROUND_END_TEARDOWN_DELAY_DURATION = 5;

    private static _logger: Logging;

    public static setLogger(logger: Logging): void {
        this._logger = logger;
    }

    public static currentRound?: Round;

    public static handleSoldierJoined(soldier: Soldier): void {
        // If there is a current round and deployment has already happened, don't do anything.
        if (Round.currentRound?._deploymentTime) return;

        soldier.state = Soldier.State.NotYetDeployed;
    }

    public constructor(params: Round.Params) {
        this._delayDuration = params.delayDuration ?? Round._DEFAULT_DELAY_DURATION;
        this._roundDuration = params.roundDuration ?? Round._DEFAULT_ROUND_DURATION;
        this._attackingUnit = params.attackingUnit;
        this._defendingUnit = params.defendingUnit;
        this._deploymentManager = params.deploymentManager;
        this._onRoundCountdownSecond = params.onRoundCountdownSecond;
        this._onRoundEnd = params.onRoundEnd;
        this._onDeploymentCountdownSecond = params.onDeploymentCountdownSecond;
        this._onDeploymentReleased = params.onDeploymentReleased;
        this._onArmed = params.onArmed;

        const objectiveOptions: Objective.Options = {
            armDuration: params.objectiveArmDuration ?? Round._OBJECTIVE_ARM_DURATION,
            defuseDuration: params.objectiveDefuseDuration ?? Round._OBJECTIVE_DEFUSE_DURATION,
            fuseDuration: params.objectiveFuseDuration ?? Round._OBJECTIVE_FUSE_DURATION,
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

        if (Round._logger.willLog(Logging.LogLevel.Info)) {
            Round._logger.log(
                `<R> Round created with ${this._attackingUnit.name} attacking and ${this._defendingUnit.name} defending ${this._objectives.length} objectives`,
                Logging.LogLevel.Info
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
            Round._logger.log(`<R> Round already started`, Logging.LogLevel.Warning);
            return;
        }

        this._startTime = Date.now();

        Soldier.setStateForAll(Soldier.State.NotYetDeployed);

        const deploymentClock = new Clocks.CountDownClock(this._delayDuration, {
            onComplete: () => {
                if (Round._logger.willLog(Logging.LogLevel.Info)) {
                    Round._logger.log(`<R> Round started`, Logging.LogLevel.Info);
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
            Round._logger.log(`<R> Round already ended`, Logging.LogLevel.Warning);
            return;
        }

        this._endTime = Date.now();
        this._roundClock.stop();
        this._deploymentManager.lock(); // Lock all players from deploying indefinitely.

        this._winCondition = winCondition;
        this._winningUnit = winningUnit;

        if (Round._logger.willLog(Logging.LogLevel.Info)) {
            Round._logger.log(
                `<R> ${winningUnit.teamId === this._attackingUnit.teamId ? 'Attackers' : 'Defenders'} (${winningUnit.name}) won`,
                Logging.LogLevel.Info
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

            if (Round._logger.willLog(Logging.LogLevel.Debug)) {
                Round._logger.log(`<R> Undeployed all players and removed all objectives`, Logging.LogLevel.Info);
            }
        }, Round._ROUND_END_TEARDOWN_DELAY_DURATION * 1_000); // Convert seconds to milliseconds.

        this._onRoundEnd?.();
    }

    private _handleObjectiveArmed(objective: Objective): void {
        if (this._armedObjective) {
            Round._logger.log(`<R> An objective has already been armed`, Logging.LogLevel.Warning);
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

        if (Round._logger.willLog(Logging.LogLevel.Info)) {
            Round._logger.log(
                `<R> Objective armed. Disabled all other objectives and updated round clock`,
                Logging.LogLevel.Info
            );
        }
    }

    private _handleObjectiveDefused(objective: Objective): void {
        if (this._armedObjective !== objective) {
            Round._logger.log(`<R> Defused objective does not match the armed objective`, Logging.LogLevel.Warning);
            return;
        }

        this._armedObjective = undefined;
        this._roundClock.stop();

        if (Round._logger.willLog(Logging.LogLevel.Info)) {
            Round._logger.log(`<R> Objective defused. Stopped round clock and ending round`, Logging.LogLevel.Info);
        }

        this._end(Round.WinCondition.ObjectiveDisarmed, this._defendingUnit);
    }

    private _handleObjectiveDestroyed(objective: Objective): void {
        if (this._armedObjective !== objective) {
            Round._logger.log(`<R> Destroyed objective does not match the armed objective`, Logging.LogLevel.Warning);
            return;
        }

        this._roundClock.stop();

        if (Round._logger.willLog(Logging.LogLevel.Info)) {
            Round._logger.log(`<R> Objective destroyed. Stopped round clock and ending round`, Logging.LogLevel.Info);
        }

        this._end(Round.WinCondition.ObjectiveDestroyed, this._attackingUnit);
    }

    public handleSoldierEliminated(soldier: Soldier): void {
        // Don't end the round if it has already ended or the unit has active soldiers.
        if (this._endTime || soldier.unit.activeSoldiers.length) return;

        if (Round._logger.willLog(Logging.LogLevel.Info)) {
            Round._logger.log(`<R> Unit ${soldier.unit.name} has no active soldiers`, Logging.LogLevel.Info);
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

export namespace Round {
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
