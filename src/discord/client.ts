import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  MessageFlags,
} from 'discord.js';
import { ALL_COMMANDS } from './commands/index.js';
import {
  handleButton,
  handleModalSubmit,
  handleSelectMenu,
} from './interactions/components.js';
import { BotContext, SlashCommand } from './types.js';

export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
  });
}

export function registerClientHandlers(client: Client, ctx: BotContext): void {
  const commandMap = new Map<string, SlashCommand>();
  for (const cmd of ALL_COMMANDS) {
    commandMap.set(cmd.data.name, cmd);
  }

  client.once(Events.ClientReady, (readyClient) => {
    console.log(
      `[Discord] Login sebagai ${readyClient.user.tag} • Aktif di ${readyClient.guilds.cache.size} server.`,
    );
    ctx.alertService.start();
  });

  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    void routeInteraction(interaction, commandMap, ctx);
  });
}

async function routeInteraction(
  interaction: Interaction,
  commandMap: Map<string, SlashCommand>,
  ctx: BotContext,
): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = commandMap.get(interaction.commandName);
      if (cmd?.autocomplete) {
        await cmd.autocomplete(interaction, ctx);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction, ctx);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, ctx);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction, ctx);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, ctx);
    }
  } catch (error) {
    console.error('[Interaction] Error saat memproses interaksi:', error);
    if (interaction.isRepliable()) {
      const payload = {
        content: '❌ Terjadi kesalahan internal saat memproses perintah ini.',
        flags: MessageFlags.Ephemeral,
      } as const;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  }
}
