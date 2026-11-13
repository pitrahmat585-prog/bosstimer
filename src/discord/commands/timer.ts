import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { parseDurationMinutes } from '../../domain/duration.js';
import { buildBossInfoEmbed, discordTs } from '../formatters.js';
import { autocompleteBossName } from '../interactions/autocomplete.js';
import { requireManagePermission } from '../permissions.js';
import { BotContext, SlashCommand } from '../types.js';

export const timerCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Atur manual, reset, atau lihat detail timer boss')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Atur sisa waktu spawn boss secara manual (misal setelah maintenance)')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Nama boss')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('in')
            .setDescription('Sisa waktu menuju spawn, misal: 45m, 2h 15m')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('window_max')
            .setDescription('Opsional: sisa waktu batas akhir window, misal: 2h 45m'),
        )
        .addStringOption((opt) =>
          opt.setName('note').setDescription('Catatan opsional').setMaxLength(150),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Hapus cooldown aktif / manual timer pada sebuah boss')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Nama boss')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Lihat detail aturan, timer, dan riwayat kill sebuah boss')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Nama boss')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction, ctx) {
    await autocompleteBossName(interaction, ctx);
  },

  async execute(interaction, ctx: BotContext) {
    if (!interaction.guildId) return;
    const sub = interaction.options.getSubcommand();
    const bossInput = interaction.options.getString('boss', true);
    const boss = ctx.bossService.resolveBossByInput(interaction.guildId, bossInput);

    if (!boss) {
      await interaction.reply({
        content: `❌ Boss **"${bossInput}"** tidak ditemukan.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'info') {
      const info = ctx.bossService.getBossState(interaction.guildId, boss.id);
      if (!info) return;
      const logs = ctx.bossRepo.listKillLogs(boss.id, 5);
      const embed = buildBossInfoEmbed(info.state, info.guild, logs);
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guild = ctx.guildRepo.getOrCreate(interaction.guildId);

    if (sub === 'reset') {
      if (!(await requireManagePermission(interaction, guild))) return;
      ctx.bossService.resetTimer(interaction.guildId, boss.id);
      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: `🔄 Timer untuk **${boss.name}** berhasil di-reset.`,
      });
      return;
    }

    if (sub === 'set') {
      const inStr = interaction.options.getString('in', true);
      const windowMaxStr = interaction.options.getString('window_max');
      const note = interaction.options.getString('note');

      const mins = parseDurationMinutes(inStr, false);
      if (mins === null) {
        await interaction.reply({
          content: `❌ Durasi tidak valid: **"${inStr}"**. Contoh: \`45m\`, \`1h 30m\`, \`2j\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      let maxMins: number | null = null;
      if (windowMaxStr) {
        maxMins = parseDurationMinutes(windowMaxStr, false);
        if (maxMins === null || maxMins <= mins) {
          await interaction.reply({
            content: `❌ \`window_max\` harus lebih besar dari \`in\` (${inStr}).`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      const now = Date.now();
      const nextAt = now + mins * 60_000;
      const nextEndAt = maxMins !== null ? now + maxMins * 60_000 : null;

      ctx.bossService.setManualTimer({
        guildId: interaction.guildId,
        bossId: boss.id,
        nextAt,
        nextEndAt,
        reportedBy: interaction.user.id,
        note,
      });

      await ctx.boardService.refreshBoard(interaction.guildId, true);

      const rangeText =
        nextEndAt !== null
          ? `${discordTs(nextAt, 'f')} – ${discordTs(nextEndAt, 't')} (${discordTs(nextAt, 'R')})`
          : `${discordTs(nextAt, 'f')} (${discordTs(nextAt, 'R')})`;

      await interaction.reply({
        content: `⏱️ Timer manual **${boss.name}** diatur oleh <@${interaction.user.id}>!\nSpawn berikutnya: ${rangeText}`,
      });
    }
  },
};
