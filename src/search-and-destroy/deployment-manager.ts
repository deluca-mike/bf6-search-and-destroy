import { Events } from 'bf6-portal-utils/events/index.ts';
import { Logging } from 'bf6-portal-utils/logging/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';

export abstract class DeploymentManager {
    public constructor(logger: Logging) {
        this._logger = logger;

        Events.OnPlayerDeployed.subscribe((player: mod.Player) => {
            if (this._logger.willLog(Logging.LogLevel.Debug)) {
                this._logger.log(`<DM> P-${mod.GetObjId(player)} deployed`, Logging.LogLevel.Debug);
            }

            this._handleDeployed(player);
        });
    }

    private _logger;
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
        if (this._logger.willLog(Logging.LogLevel.Debug)) {
            this._logger.log(
                `<DM> P-${mod.GetObjId(player)} joined on T-${mod.GetObjId(mod.GetTeam(player))}`,
                Logging.LogLevel.Debug
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

        if (this._logger.willLog(Logging.LogLevel.Info)) {
            this._logger.log(`<FDM> Deploying players in ${timeUntilRelease / 1_000}s...`, Logging.LogLevel.Info);
        }

        this._timeout = Timers.setTimeout(() => {
            this._setAllPlayersDeployEnabled((this._deployEnabled = true));
            this._afterDeployEnabled();

            if (this._logger.willLog(Logging.LogLevel.Info)) {
                this._logger.log(`<FDM> Players deployed`, Logging.LogLevel.Info);
            }

            if (timeUntilLock === undefined) return;

            if (this._logger.willLog(Logging.LogLevel.Info)) {
                this._logger.log(`<FDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, Logging.LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(
                () => {
                    this._setAllPlayersDeployEnabled((this._deployEnabled = false));

                    if (this._logger.willLog(Logging.LogLevel.Info)) {
                        this._logger.log(`<FDM> Deployment disabled`, Logging.LogLevel.Info);
                    }
                },
                timeUntilLock > 1 ? timeUntilLock : 1
            );
        }, timeUntilRelease);
    }

    public lock(timeUntilLock: number = 0, timeUntilRelease?: number): void {
        Timers.clear(this._timeout);

        if (this._logger.willLog(Logging.LogLevel.Info)) {
            this._logger.log(`<FDM> Disabling deployment in ${timeUntilLock / 1_000}s...`, Logging.LogLevel.Info);
        }

        this._timeout = Timers.setTimeout(() => {
            this._setAllPlayersDeployEnabled((this._deployEnabled = false));

            if (this._logger.willLog(Logging.LogLevel.Info)) {
                this._logger.log(`<FDM> Deployment disabled`, Logging.LogLevel.Info);
            }

            if (timeUntilRelease === undefined) return;

            if (this._logger.willLog(Logging.LogLevel.Info)) {
                this._logger.log(`<FDM> Deploying players in ${timeUntilRelease / 1_000}s...`, Logging.LogLevel.Info);
            }

            this._timeout = Timers.setTimeout(() => {
                this._setAllPlayersDeployEnabled((this._deployEnabled = true));
                this._afterDeployEnabled();

                if (this._logger.willLog(Logging.LogLevel.Info)) {
                    this._logger.log(`<FDM> Players deployed`, Logging.LogLevel.Info);
                }
            }, timeUntilRelease);
        }, timeUntilLock);
    }
}

export class ForceDeploymentManager extends DeploymentManager {
    protected _afterDeployEnabled(): void {
        mod.DeployAllPlayers();
    }
}

export class SelfDeploymentManager extends DeploymentManager {
    protected _afterDeployEnabled(): void {}
}
