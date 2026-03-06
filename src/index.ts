import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';

import { DebugTool } from './debug-tool/index.ts';
import { getPlayerStateVectorString } from './helpers/index.ts';
import { SearchAndDestroy } from './search-and-destroy/index.ts';

const OBJECTIVE_1 = { x: 334.89, y: 69.32, z: 134.06, orientation: 90 };
const OBJECTIVE_2 = { x: 342.36, y: 69.24, z: 137.11, orientation: 180 };

const roundObjectives: SearchAndDestroy.RoundObjectives[] = [
    [OBJECTIVE_1, OBJECTIVE_2],
    [OBJECTIVE_1, OBJECTIVE_2],
    [OBJECTIVE_1, OBJECTIVE_2],
];

let adminDebugTool: DebugTool | undefined;
let telemetryInterval: number | undefined;

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
            visible: false,
        },
    };

    adminDebugTool = new DebugTool(player, debugToolOptions);

    new MultiClickDetector(player, () => {
        adminDebugTool?.showDebugMenu();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.deployAll), () => {
        adminDebugTool?.dynamicLog(`Deploying all players`);
        mod.DeployAllPlayers();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.undeployAll), () => {
        adminDebugTool?.dynamicLog(`Undeploying all players`);
        mod.UndeployAllPlayers();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.deployPlayer), () => {
        adminDebugTool?.dynamicLog(`Deploying player`);
        mod.DeployPlayer(player);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.undeployPlayer), () => {
        adminDebugTool?.dynamicLog(`Undeploying player`);
        mod.UndeployPlayer(player);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.enableAllDeploy), () => {
        adminDebugTool?.dynamicLog(`Enabling all player deploy`);
        mod.EnableAllPlayerDeploy(true);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.disableAllDeploy), () => {
        adminDebugTool?.dynamicLog(`Disabling all player deploy`);
        mod.EnableAllPlayerDeploy(false);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.enablePlayerDeploy), () => {
        adminDebugTool?.dynamicLog(`Enabling player deploy`);
        mod.EnablePlayerDeploy(player, true);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.disablePlayerDeploy), () => {
        adminDebugTool?.dynamicLog(`Disabling player deploy`);
        mod.EnablePlayerDeploy(player, false);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.switchTeams), () => {
        adminDebugTool?.dynamicLog(`Switching teams`);
        mod.SwitchTeams(mod.GetTeam(1), mod.GetTeam(2));
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.toggleTeam), () => {
        adminDebugTool?.dynamicLog(`Toggling team`);
        mod.SetTeam(player, mod.GetTeam(mod.GetObjId(mod.GetTeam(player)) === 1 ? 2 : 1));
    });

    // Log a message to the static logger.
    adminDebugTool?.staticLog(`Triple-click interact key to open debug menu.`, 0);

    const logger = (text: string) => adminDebugTool?.dynamicLog(text);

    SearchAndDestroy.setLogging(logger, SearchAndDestroy.LogLevel.Debug);
}

function destroyAdminDebugTool(playerId: number): void {
    if (playerId !== 0) return;

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
Events.OnPlayerLeaveGame.subscribe(destroyAdminDebugTool);

Events.OnGameModeStarted.subscribe(() => {
    SearchAndDestroy.start({
        roundObjectives,
    });
});
