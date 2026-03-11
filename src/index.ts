import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';

import { DebugTool } from './debug-tool/index.ts';
import { getPlayerStateVectorString } from './helpers/index.ts';
import { SearchAndDestroy } from './search-and-destroy/index.ts';

const DEBUG = true;

const OBJECTIVE_1 = { x: 342.17, y: 65.57, z: 72.12, orientation: 45 };
const OBJECTIVE_2 = { x: 335.05, y: 65.77, z: 111.93, orientation: 90 };

const roundObjectives: SearchAndDestroy.RoundObjectives[] = [
    [OBJECTIVE_1, OBJECTIVE_2],
    [OBJECTIVE_1, OBJECTIVE_2],
    [OBJECTIVE_1, OBJECTIVE_2],
    [OBJECTIVE_1, OBJECTIVE_2],
    [OBJECTIVE_1, OBJECTIVE_2],
];

let adminDebugTool: DebugTool | undefined;
let telemetryInterval: number | undefined;

function createAdminDebugTool(player: mod.Player): void {
    if (!DEBUG || mod.GetObjId(player) !== 0) return;

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

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.toggleTeam), () => {
        adminDebugTool?.dynamicLog(`Toggling team`);
        mod.SetTeam(player, mod.GetTeam(mod.GetObjId(mod.GetTeam(player)) === 1 ? 2 : 1));
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.flipTeams), () => {
        adminDebugTool?.dynamicLog(`Flipping teams`);
        mod.SwitchTeams(mod.GetTeam(1), mod.GetTeam(2));
    });

    // Log a message to the static logger.
    adminDebugTool?.staticLog(`Triple-click interact key to open debug menu.`, 0);

    const logger = (text: string) => adminDebugTool?.dynamicLog(text);

    SearchAndDestroy.setLogging(logger, SearchAndDestroy.LogLevel.Debug);
}

function destroyAdminDebugTool(playerId: number): void {
    if (!DEBUG || playerId !== 0) return;

    Timers.clearInterval(telemetryInterval);
    adminDebugTool?.destroy();
    telemetryInterval = undefined;
    adminDebugTool = undefined;
}

function showTelemetry(player: mod.Player): void {
    // The admin player is player id 0 for non-persistent test servers,
    // so don't do the rest of this unless it's the admin player.
    if (!DEBUG || mod.GetObjId(player) !== 0) return;

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
    if (!DEBUG || mod.GetObjId(player) !== 0) return;

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
