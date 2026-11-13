import { AutocompleteInteraction } from 'discord.js';
import { COMMON_TIMEZONES } from '../../services/presetData.js';
import { BotContext } from '../types.js';

export async function autocompleteBossName(
  interaction: AutocompleteInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().trim();
  const matches = ctx.bossRepo.findByNameOrPrefix(interaction.guildId, focused);

  await interaction.respond(
    matches.slice(0, 25).map((b) => {
      const modeTag = b.mode === 'cooldown' ? 'CD' : 'Jadwal';
      const disabledTag = b.enabled ? '' : ' [Nonaktif]';
      return {
        name: `${b.name} (${modeTag} • ${b.category})${disabledTag}`.slice(0, 100),
        value: b.name,
      };
    }),
  );
}

export async function autocompleteTimezone(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused().trim().toLowerCase();
  const filtered = COMMON_TIMEZONES.filter(
    (tz) =>
      tz.label.toLowerCase().includes(focused) ||
      tz.value.toLowerCase().includes(focused),
  );

  await interaction.respond(
    filtered.slice(0, 25).map((tz) => ({
      name: tz.label,
      value: tz.value,
    })),
  );
}
