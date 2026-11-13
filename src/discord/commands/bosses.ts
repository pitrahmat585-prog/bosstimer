import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buildStatusListEmbed } from '../formatters.js';
import { BotContext, SlashCommand } from '../types.js';

export const bossesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('bosses')
    .setDescription('Lihat daftar timer dan status semua boss saat ini')
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName('filter')
        .setDescription('Filter tampilan boss')
        .addChoices(
          { name: 'Semua Boss Aktif', value: 'active' },
          { name: 'Live & Segera Spawn', value: 'urgent' },
          { name: 'Mode Cooldown saja', value: 'cooldown' },
          { name: 'Mode Jadwal Tetap saja', value: 'schedule' },
          { name: 'Semua (termasuk Nonaktif)', value: 'all' },
        ),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('public')
        .setDescription('Kirim ke channel agar semua member lihat (default: hanya kamu)'),
    ),

  async execute(interaction, ctx: BotContext) {
    if (!interaction.guildId) return;
    const filter = interaction.options.getString('filter') ?? 'active';
    const isPublic = interaction.options.getBoolean('public') ?? false;

    const { guild, states } = ctx.bossService.getGuildBossStates(interaction.guildId);

    let filtered = states;
    let title = '📋 Daftar Status Boss';

    if (filter === 'urgent') {
      filtered = states.filter((s) =>
        ['window_open', 'spawned', 'overdue', 'soon'].includes(s.status),
      );
      title = '🔥 Boss Live & Segera Spawn';
    } else if (filter === 'cooldown') {
      filtered = states.filter((s) => s.boss.mode === 'cooldown' && s.boss.enabled);
      title = '⏱️ Boss Mode Cooldown';
    } else if (filter === 'schedule') {
      filtered = states.filter((s) => s.boss.mode === 'schedule' && s.boss.enabled);
      title = '📅 Boss Mode Jadwal Tetap';
    } else if (filter === 'all') {
      title = '📜 Semua Boss (Termasuk Nonaktif)';
    }

    const embed = buildStatusListEmbed(
      filtered,
      guild,
      title,
      filter === 'all',
    );

    await interaction.reply({
      embeds: [embed],
      flags: isPublic ? undefined : MessageFlags.Ephemeral,
    });
  },
};
