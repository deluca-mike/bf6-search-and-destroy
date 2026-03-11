import { Events } from 'bf6-portal-utils/events/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';

import { Unit } from './unit.ts';

export class Soldier {
    private static readonly _SKIP_MAN_DOWN = true; // true for no revives.

    private static readonly _SOLDIERS = new Map<number, Soldier>();

    private static _logger: Logging;

    public static setLogger(logger: Logging): void {
        this._logger = logger;
    }

    public static getSoldier(player: mod.Player): Soldier | undefined {
        return Soldier._SOLDIERS.get(mod.GetObjId(player));
    }

    public static setStateForAll(state: Soldier.State): void {
        for (const soldier of Soldier._SOLDIERS.values()) {
            soldier.state = state;
        }
    }

    public static handlePlayerLeaveGame(playerId: number): void {
        if (Soldier._logger.willLog(Logging.LogLevel.Info)) {
            Soldier._logger.log(`<S> P-${playerId} left game`, Logging.LogLevel.Info);
        }

        const soldier = Soldier._SOLDIERS.get(playerId);

        if (!soldier) return;

        Soldier._SOLDIERS.delete(playerId);

        soldier._handleLeave();
    }

    static {
        Events.OnPlayerDeployed.subscribe((player: mod.Player) => {
            const playerId = mod.GetObjId(player);

            if (Soldier._logger.willLog(Logging.LogLevel.Info)) {
                Soldier._logger.log(`<S> P-${playerId} deployed`, Logging.LogLevel.Info);
            }

            const soldier = Soldier._SOLDIERS.get(playerId);

            if (!soldier) return;

            soldier._handleDeployed();
        });

        Events.subscribe(
            Soldier._SKIP_MAN_DOWN ? Events.Type.OnPlayerDied : Events.Type.OnPlayerUndeploy,
            (player: mod.Player) => {
                const playerId = mod.GetObjId(player);

                if (Soldier._logger.willLog(Logging.LogLevel.Info)) {
                    Soldier._logger.log(`<S> P-${playerId} eliminated`, Logging.LogLevel.Info);
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

        Soldier._logger.log(`<S> Soldier-${this._playerId} created`, Logging.LogLevel.Info);
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

export namespace Soldier {
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
