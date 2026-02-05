import { Events } from 'bf6-portal-utils/events/index.ts';
import { Timers } from 'bf6-portal-utils/timers/index.ts';
import { UI } from 'bf6-portal-utils/ui/index.ts';
import { MultiClickDetector } from 'bf6-portal-utils/multi-click-detector/index.ts';

import { DebugTool } from './debug-tool/index.ts';
import { getPlayerStateVectorString } from './helpers/index.ts';

mod.EnableAllPlayerDeploy(false);

let adminDebugTool: DebugTool | undefined;
let telemetryInterval: number | undefined;
let mcom: mod.MCOM | undefined;

// 334.89, 69.32, 134.06, 90
// 342.36, 69.24, 137.11, 270

function createAdminDebugTool(player: mod.Player): void {
    if (mod.GetObjId(player) != 0) return;

    const debugToolOptions: DebugTool.Options = {
        staticLogger: {
            visible: true,
        },
        dynamicLogger: {
            visible: true,
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
        mod.EnableAllPlayerDeploy(true);
        await mod.Wait(1);
        mod.DeployAllPlayers();
        mod.EnableAllPlayerDeploy(false);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.undeployAll), async () => {
        adminDebugTool?.dynamicLog(`Undeploying all players`);
        mod.UndeployAllPlayers();
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.switchTeams), async () => {
        adminDebugTool?.dynamicLog(`Switching teams`);
        mod.SwitchTeams(mod.GetTeam(1), mod.GetTeam(2));
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.toggleTeam), async () => {
        adminDebugTool?.dynamicLog(`Toggling team`);
        mod.SetTeam(player, mod.GetTeam(mod.GetObjId(mod.GetTeam(player)) === 1 ? 2 : 1));
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.spawnMCOM), async () => {
        if (mcom) return;

        adminDebugTool?.dynamicLog(`Spawning MCOM`);

        const position = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        const facingDirection = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);

        const spawnPosition = mod.CreateVector(
            mod.XComponentOf(position) + mod.XComponentOf(facingDirection) * 10,
            mod.YComponentOf(position),
            mod.ZComponentOf(position) + mod.ZComponentOf(facingDirection) * 10
        );

        mcom = mod.SpawnObject(mod.RuntimeSpawn_Common.MCOM, spawnPosition, mod.CreateVector(0, 0, 0)) as mod.MCOM;
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.enableMCOM), async () => {
        if (!mcom) return;

        adminDebugTool?.dynamicLog(`Enabling MCOM`);
        mod.EnableGameModeObjective(mcom, true);
    });

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.disableMCOM), async () => {
        if (!mcom) return;

        adminDebugTool?.dynamicLog(`Disabling MCOM`);
        mod.EnableGameModeObjective(mcom, false);
    });

    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.template.debug.buttons.setMCOMFuseTime10),
        async () => {
            if (!mcom) return;

            adminDebugTool?.dynamicLog(`Setting MCOM fuse time (10s)`);
            mod.SetMCOMFuseTime(mcom, 10);
        }
    );
    adminDebugTool?.addDebugMenuButton(
        mod.Message(mod.stringkeys.template.debug.buttons.setMCOMFuseTime120),
        async () => {
            if (!mcom) return;

            adminDebugTool?.dynamicLog(`Setting MCOM fuse time (120s)`);
            mod.SetMCOMFuseTime(mcom, 120);
        }
    );

    adminDebugTool?.addDebugMenuButton(mod.Message(mod.stringkeys.template.debug.buttons.destroyMCOM), async () => {
        if (!mcom) return;

        adminDebugTool?.dynamicLog(`Destroying MCOM`);
        mod.UnspawnObject(mcom);
        mcom = undefined;
    });

    // Log a message to the static logger.
    adminDebugTool?.staticLog(`Triple-click interact key to open debug menu.`, 0);
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

function handlePlayerDeployed(player: mod.Player): void {
    // Log a message to the dynamic logger that the player has deployed.
    adminDebugTool?.dynamicLog(`P-${mod.GetObjId(player)} (T-${mod.GetObjId(mod.GetTeam(player))}) deployed.`);
}

function handlePlayerUndeployed(player: mod.Player): void {
    // Log a message to the dynamic logger that the player has undeployed.
    adminDebugTool?.dynamicLog(`P-${mod.GetObjId(player)} (T-${mod.GetObjId(mod.GetTeam(player))}) undeployed.`);
}

function handlePlayerDied(
    player: mod.Player,
    otherPlayer: mod.Player,
    deathType: mod.DeathType,
    weaponUnlock: mod.WeaponUnlock
): void {
    // Log a message to the dynamic logger that the player has died.
    adminDebugTool?.dynamicLog(
        `P-${mod.GetObjId(otherPlayer)} (T-${mod.GetObjId(mod.GetTeam(otherPlayer))}) killed P-${mod.GetObjId(player)} (T-${mod.GetObjId(mod.GetTeam(player))}).`
    );
}

function handlePlayerEarnedKill(
    player: mod.Player,
    otherPlayer: mod.Player,
    deathType: mod.DeathType,
    weaponUnlock: mod.WeaponUnlock
): void {
    // Log a message to the dynamic logger that the player has earned a kill.
    adminDebugTool?.dynamicLog(
        `P-${mod.GetObjId(player)} (T-${mod.GetObjId(mod.GetTeam(player))}) earned a kill on P-${mod.GetObjId(otherPlayer)} (T-${mod.GetObjId(mod.GetTeam(otherPlayer))}).`
    );
}

function handlePlayerSwitchedTeam(player: mod.Player, team: mod.Team): void {
    // Log a message to the dynamic logger that the player has switched teams.
    adminDebugTool?.dynamicLog(
        `P-${mod.GetObjId(player)} (T-${mod.GetObjId(mod.GetTeam(player))}) switched teams to T-${mod.GetObjId(team)}.`
    );
}

function handleMCOMArmed(mcom: mod.MCOM): void {
    adminDebugTool?.dynamicLog(`MCOM-${mod.GetObjId(mcom)} armed.`);
}

function handleMCOMDefused(mcom: mod.MCOM): void {
    adminDebugTool?.dynamicLog(`MCOM-${mod.GetObjId(mcom)} defused.`);
}

function handleMCOMDestroyed(mcom: mod.MCOM): void {
    adminDebugTool?.dynamicLog(`MCOM-${mod.GetObjId(mcom)} destroyed.`);
}

// Event subscription needed for handling UI button events.
Events.OnPlayerUIButtonEvent.subscribe(UI.handleButtonEvent);

// Event subscriptions for the admin debug tool.
Events.OnPlayerJoinGame.subscribe(createAdminDebugTool);
Events.OnPlayerDeployed.subscribe(showTelemetry);
Events.OnPlayerUndeploy.subscribe(stopTelemetry);
Events.OnPlayerLeaveGame.subscribe((eventNumber) => destroyAdminDebugTool());

// Event subscriptions needed for multi-click detectors.
Events.OngoingPlayer.subscribe(MultiClickDetector.handleOngoingPlayer);
Events.OnPlayerLeaveGame.subscribe(MultiClickDetector.pruneInvalidPlayers);

// Event subscriptions for notifying about players.
Events.OnPlayerDeployed.subscribe(handlePlayerDeployed);
Events.OnPlayerUndeploy.subscribe(handlePlayerUndeployed);
Events.OnPlayerDied.subscribe(handlePlayerDied);
Events.OnPlayerEarnedKill.subscribe(handlePlayerEarnedKill);
Events.OnPlayerSwitchTeam.subscribe(handlePlayerSwitchedTeam);

// Event subscriptions for MCOMs.
Events.OnMCOMArmed.subscribe(handleMCOMArmed);
Events.OnMCOMDefused.subscribe(handleMCOMDefused);
Events.OnMCOMDestroyed.subscribe(handleMCOMDestroyed);
