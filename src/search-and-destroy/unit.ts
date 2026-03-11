import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';

import { Soldier } from './soldier.ts';

export class Unit {
    private static readonly _MAX_PLAYERS_PER_UNIT = 8;
    private static readonly _SKIP_MAN_DOWN = true; // true for no revives.

    private static readonly _UNITS = new Map<number, Unit>();

    private static readonly _SOLDIERS_UNIT_MAP = new Map<number, Unit>();

    private static _logger: Logging;

    public static setLogger(logger: Logging): void {
        this._logger = logger;
    }

    /**
     * Since `mod.SwitchTeams` is broken for anything other that switch team 0 with team 1, we first need to move
     * one player from `unit1` to team 0, then move one of each player from `unit2` and `unit1` to the other team,
     * and then move the first player from team 0 to `unit2`.
     */
    private static async _switchSides(unit1: Unit, unit2: Unit): Promise<void> {
        return new Promise((resolve) => {
            const soldiersOfUnit1 = Array.from(unit1._SOLDIERS);
            const soldiersOfUnit2 = Array.from(unit2._SOLDIERS);

            for (let i = 0; i < Unit._MAX_PLAYERS_PER_UNIT; ++i) {
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
            Unit._logger.log(`<U> Unit not found for team ${teamId1}`, Logging.LogLevel.Error);
            return;
        }

        if (!unit2) {
            Unit._logger.log(`<U> Unit not found for team ${teamId2}`, Logging.LogLevel.Error);
            return;
        }

        if (Unit._logger.willLog(Logging.LogLevel.Info)) {
            Unit._logger.log(
                `<U> Flipping teams ${unit1.name} (${teamId1}) and ${unit2.name} (${teamId2})...`,
                Logging.LogLevel.Info
            );
        }

        await Unit._switchSides(unit1, unit2);

        unit1._team = mod.GetTeam((unit1._teamId = teamId2));
        unit2._team = mod.GetTeam((unit2._teamId = teamId1));

        Unit._UNITS.set(teamId2, unit1);
        Unit._UNITS.set(teamId1, unit2);

        if (Unit._logger.willLog(Logging.LogLevel.Info)) {
            Unit._logger.log(
                `<U> Teams ${unit1.name} (${teamId1}) and ${unit2.name} (${teamId2}) flipped`,
                Logging.LogLevel.Info
            );
        }
    }

    public static switchUnit(soldier: Soldier, unit: Unit): boolean {
        const currentUnit = Unit._SOLDIERS_UNIT_MAP.get(soldier.playerId);

        if (!currentUnit) {
            Unit._logger.log(`<U> Unit not found for P-${soldier.playerId}`, Logging.LogLevel.Error);
            return false;
        }

        if (unit.soldierCount >= 8) {
            Unit._logger.log(
                `<U> Unit ${unit.name} already has ${unit.soldierCount} soldiers`,
                Logging.LogLevel.Warning
            );
            return false;
        }

        Unit._logger.log(
            `<U> Switching unit for P-${soldier.playerId} from ${currentUnit.name} to ${unit.name}`,
            Logging.LogLevel.Info
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

        if (Unit._logger.willLog(Logging.LogLevel.Debug)) {
            Unit._logger.log(`<U> P-${mod.GetObjId(player)} joined game on T-${teamId}`, Logging.LogLevel.Debug);
        }

        const unit = Unit.getUnitByTeamId(teamId);

        if (!unit) {
            Unit._logger.log(`<U> Unit not found for team ${teamId}`, Logging.LogLevel.Error);
            return;
        }

        const callbacks: Soldier.Callbacks = {
            onStateChange: (state) => unit._handleSoldierStateChange(soldier, state),
        };

        const soldier = new Soldier(player, callbacks, Unit._SKIP_MAN_DOWN);

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

export namespace Unit {
    export type Callbacks = {
        onSoldierStateChange?: (soldier: Soldier) => Promise<void> | void;
    };
}
