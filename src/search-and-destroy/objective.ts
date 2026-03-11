import { Events } from 'bf6-portal-utils/events/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { Vectors } from 'bf6-portal-utils/vectors/index.ts';

export class Objective {
    public static readonly DEFAULT_FUSE_DURATION = 60; // 60 seconds
    public static readonly DEFAULT_ARM_DURATION = 7; // 7 seconds
    public static readonly DEFAULT_DEFUSE_DURATION = 10; // 10 seconds

    private static readonly _OBJECTIVES = new Map<number, Objective>();

    private static _logger: Logging;

    public static setLogger(logger: Logging): void {
        this._logger = logger;
    }

    static {
        Events.OnMCOMArmed.subscribe((mcom: mod.MCOM) => {
            const mcomId = mod.GetObjId(mcom);

            if (Objective._logger.willLog(Logging.LogLevel.Info)) {
                Objective._logger.log(`<O> MCOM-${mcomId} armed`, Logging.LogLevel.Info);
            }

            const objective = Objective._OBJECTIVES.get(mcomId);

            if (!objective) return;

            objective._handleArmed();
        });

        Events.OnMCOMDefused.subscribe((mcom: mod.MCOM) => {
            const mcomId = mod.GetObjId(mcom);

            if (Objective._logger.willLog(Logging.LogLevel.Info)) {
                Objective._logger.log(`<O> MCOM-${mcomId} defused`, Logging.LogLevel.Info);
            }

            const objective = Objective._OBJECTIVES.get(mcomId);

            if (!objective) return;

            objective._handleDefused();
        });

        Events.OnMCOMDestroyed.subscribe((mcom: mod.MCOM) => {
            const mcomId = mod.GetObjId(mcom);

            if (Objective._logger.willLog(Logging.LogLevel.Info)) {
                Objective._logger.log(`<O> MCOM-${mcomId} destroyed`, Logging.LogLevel.Info);
            }

            const objective = Objective._OBJECTIVES.get(mcomId);

            if (!objective) return;

            objective._handleDestroyed();
        });
    }

    public constructor(position: Objective.Position, callbacks?: Objective.Callbacks, options?: Objective.Options) {
        this._mcom = mod.SpawnObject(
            mod.RuntimeSpawn_Common.MCOM,
            mod.CreateVector(position.x, position.y, position.z),
            Vectors.getRotationVector(position.orientation)
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

        if (Objective._logger.willLog(Logging.LogLevel.Info)) {
            Objective._logger.log(
                `<O> Objective-${this._id} created at <${position.x}, ${position.y}, ${position.z}> (${position.orientation}-deg)`,
                Logging.LogLevel.Info
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
            Objective._logger.log(`<O> Objective dose not exist and cannot be disabled`, Logging.LogLevel.Warning);
            return;
        }

        mod.EnableGameModeObjective(this._mcom, (this._enabled = false));

        if (Objective._logger.willLog(Logging.LogLevel.Info)) {
            Objective._logger.log(`<O> Objective-${this._id} disabled`, Logging.LogLevel.Info);
        }
    }

    public remove(): void {
        if (!this._mcom) {
            Objective._logger.log(`<O> Objective dose not exist and cannot be removed`, Logging.LogLevel.Warning);
            return;
        }

        mod.UnspawnObject(this._mcom);
        Objective._OBJECTIVES.delete(this._id!);

        if (Objective._logger.willLog(Logging.LogLevel.Info)) {
            Objective._logger.log(`<O> Objective-${this._id} removed`, Logging.LogLevel.Info);
        }

        this._mcom = undefined;
        this._id = undefined;
    }
}

export namespace Objective {
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
