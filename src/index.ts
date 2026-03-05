import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';

import { DebugTool } from './debug-tool/index.ts';
import { getPlayerStateVectorString } from './helpers/index.ts';
import { Vectors } from 'bf6-portal-utils/vectors/index.ts';
// import { SearchAndDestroy } from './search-and-destroy/index.ts';

const MCOM_POOLS = {
    A: [111, 211, 311],
    B: [112, 212, 312],
};

// const roundObjectives: SearchAndDestroy.RoundObjectives[] = [
//     [OBJECTIVE_1, OBJECTIVE_2],
//     [OBJECTIVE_1, OBJECTIVE_2],
//     [OBJECTIVE_1, OBJECTIVE_2],
// ];

// export function SetCapturePointCapturingTime(capturePoint: CapturePoint, capturingTime: number): void;
// export function SetCapturePointNeutralizationTime(capturePoint: CapturePoint, neutralizationTime: number): void;
// export function SetCapturePointOwner(capturePoint: CapturePoint, team: Team): void;
// export function SetMaxCaptureMultiplier(capturePoint: CapturePoint, multiplier: number): void;

let adminDebugTool: DebugTool | undefined;
let telemetryInterval: number | undefined;
let mcomA: MCOM | undefined;
let mcomB: MCOM | undefined;

function createAdminDebugTool(player: mod.Player): void {
    if (mod.GetObjId(player) != 0) return;

    const debugToolOptions: DebugTool.Options = {
        staticLogger: {
            visible: true,
        },
        dynamicLogger: {
            visible: true,
            width: 700,
            height: 800,
        },
        debugMenu: {
            visible: true,
        },
    };

    adminDebugTool = new DebugTool(player, debugToolOptions);

    new MultiClickDetector(player, () => {
        adminDebugTool?.showDebugMenu();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.deployAll), async () => {
        adminDebugTool?.dynamicLog(`Deploying all players`);
        mod.DeployAllPlayers();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.undeployAll), async () => {
        adminDebugTool?.dynamicLog(`Undeploying all players`);
        mod.UndeployAllPlayers();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.deployPlayer), async () => {
        adminDebugTool?.dynamicLog(`Deploying player`);
        mod.DeployPlayer(player);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.undeployPlayer), async () => {
        adminDebugTool?.dynamicLog(`Undeploying player`);
        mod.UndeployPlayer(player);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.enableAllDeploy), async () => {
        adminDebugTool?.dynamicLog(`Enabling all player deploy`);
        mod.EnableAllPlayerDeploy(true);
    });

    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.template.debug.buttons.disableAllDeploy),
        async () => {
            adminDebugTool?.dynamicLog(`Disabling all player deploy`);
            mod.EnableAllPlayerDeploy(false);
        }
    );

    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.template.debug.buttons.enablePlayerDeploy),
        async () => {
            adminDebugTool?.dynamicLog(`Enabling player deploy`);
            mod.EnablePlayerDeploy(player, true);
        }
    );

    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.template.debug.buttons.disablePlayerDeploy),
        async () => {
            adminDebugTool?.dynamicLog(`Disabling player deploy`);
            mod.EnablePlayerDeploy(player, false);
        }
    );

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.switchTeams), async () => {
        adminDebugTool?.dynamicLog(`Switching teams`);
        mod.SwitchTeams(mod.GetTeam(1), mod.GetTeam(2));
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.toggleTeam), async () => {
        adminDebugTool?.dynamicLog(`Toggling team`);
        mod.SetTeam(player, mod.GetTeam(mod.GetObjId(mod.GetTeam(player)) === 1 ? 2 : 1));
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.createMCOMA), async () => {
        adminDebugTool?.dynamicLog(`Creating MCOM A`);

        mcomA = MCOM.createMCOM('A', 90, {
            enabled: true,
            onArmed: () => {
                adminDebugTool?.dynamicLog(`MCOM A armed`);
            },
            onDefused: () => {
                adminDebugTool?.dynamicLog(`MCOM A defused`);
            },
            onDestroyed: () => {
                adminDebugTool?.dynamicLog(`MCOM A destroyed`);
            },
            onSecond: (seconds) => {
                adminDebugTool?.dynamicLog(`MCOM A: ${seconds} seconds remaining`);
            },
            onMinute: (minutes) => {
                adminDebugTool?.dynamicLog(`MCOM A: ${minutes} minutes remaining`);
            },
        });

        if (!mcomA) {
            adminDebugTool?.dynamicLog(`Failed to create MCOM A`);
            return;
        }

        adminDebugTool?.dynamicLog(`MCOM A created at ${Vectors.getVectorString(mcomA.position)}`);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.createMCOMB), async () => {
        adminDebugTool?.dynamicLog(`Creating MCOM B`);

        mcomB = MCOM.createMCOM('B', 30, {
            enabled: true,
            onArmed: () => {
                adminDebugTool?.dynamicLog(`MCOM B armed`);
            },
            onDefused: () => {
                adminDebugTool?.dynamicLog(`MCOM B defused`);
            },
            onDestroyed: () => {
                adminDebugTool?.dynamicLog(`MCOM B destroyed`);
            },
            onSecond: (seconds) => {
                adminDebugTool?.dynamicLog(`MCOM B: ${seconds} seconds remaining`);
            },
            onMinute: (minutes) => {
                adminDebugTool?.dynamicLog(`MCOM B: ${minutes} minutes remaining`);
            },
        });

        if (!mcomB) {
            adminDebugTool?.dynamicLog(`Failed to create MCOM B`);
            return;
        }

        adminDebugTool?.dynamicLog(`MCOM B created at ${Vectors.getVectorString(mcomB.position)}`);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.disposeMCOMA), async () => {
        adminDebugTool?.dynamicLog(`Disposing MCOM A`);
        mcomA?.dispose();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.disposeMCOMB), async () => {
        adminDebugTool?.dynamicLog(`Disposing MCOM B`);
        mcomB?.dispose();
    });

    // Log a message to the static logger.
    adminDebugTool?.staticLog(`Triple-click interact key to open debug menu.`, 0);

    // const logger = (text: string) => adminDebugTool?.dynamicLog(text);

    // SearchAndDestroy.setLogging(logger, SearchAndDestroy.LogLevel.Debug);
}

function destroyAdminDebugTool(): void {
    const players = mod.AllPlayers();
    const count = mod.CountOf(players);

    for (let i = 0; i < count; ++i) {
        const player = mod.ValueInArray(players, i) as mod.Player;

        // If the player is the admin player, then we know the admin is still in the game, so we can exit this function.
        if (mod.GetObjId(player) === 0) return;
    }

    // Clear the telemetry interval so it doesn't continue to log the admin's position and facing direction, and
    // destroy the debug tool.
    Timers.clearInterval(telemetryInterval);
    adminDebugTool?.destroy();
    telemetryInterval = undefined;
    adminDebugTool = undefined;
}

function showTelemetry(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    if (mod.GetObjId(player) != 0) return;

    // Log the admin's position and facing direction to the static logger, in rows 1 and 2, every second.
    telemetryInterval = Timers.setInterval(() => {
        adminDebugTool?.staticLog(
            `Position: ${getPlayerStateVectorString(player, mod.SoldierStateVector.GetPosition)}`,
            1
        );

        adminDebugTool?.staticLog(
            `Facing: ${getPlayerStateVectorString(player, mod.SoldierStateVector.GetFacingDirection)}`,
            2
        );
    }, 1000);
}

function stopTelemetry(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    if (mod.GetObjId(player) != 0) return;

    // Clear the telemetry interval so it doesn't continue to log the admin's position and facing direction.
    Timers.clearInterval(telemetryInterval);
}

// Event subscriptions for the admin debug tool.
Events.OnPlayerJoinGame.subscribe(createAdminDebugTool);
Events.OnPlayerDeployed.subscribe(showTelemetry);
Events.OnPlayerUndeploy.subscribe(stopTelemetry);
Events.OnPlayerLeaveGame.subscribe((eventNumber) => destroyAdminDebugTool());

Events.OnGameModeStarted.subscribe(() => {
    MCOM.setMCOMPools(MCOM_POOLS);
    // SearchAndDestroy.start({
    //     roundObjectives,
    // });
});
