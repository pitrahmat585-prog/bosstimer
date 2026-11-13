import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  parseDurationMinutes,
  resolveRecentTimeInZone,
} from '../../domain/duration.js';
import { discordTs } from '../formatters.js';
import { autocompleteBossName } from '../interactions/autocomplete.js';
import { BotContext, SlashCommand } from '../types.js';

export const killCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('kill')
    .setDescription('Laporkan boss mati untuk memulai/memperbarui timer respawn')
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName('boss')
        .setDescription('Nama boss yang baru mati')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('ago')
        .setDescription('Jika mati beberapa waktu lalu, misal: 10m, 1h 15m'),
    )
    .addStringOption((opt) =>
      opt
        .setName('time')
        .setDescription('Atau jam mati (HH:mm) sesuai zona waktu server, misal: 20:15'),
    )
    .addStringOption((opt) =>
      opt
        .setName('note')
        .setDescription('Catatan opsional (channel, drop, dll.)')
        .setMaxLength(150),
    ),

  async autocomplete(interaction, ctx) {
    await autocompleteBossName(interaction, ctx);
  },

  async execute(interaction, ctx: BotContext) {
    if (!interaction.guildId) return;

    const bossInput = interaction.options.getString('boss', true);
    const agoInput = interaction.options.getString('ago');
    const timeInput = interaction.options.getString('time');
    const note = interaction.options.getString('note');

    if (agoInput && timeInput) {
      await interaction.reply({
        content: '❌ Pilih salah satu saja: isi `ago` **atau** `time`, jangan keduanya.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const boss = ctx.bossService.resolveBossByInput(interaction.guildId, bossInput);
    if (!boss) {
      await interaction.reply({
        content: `❌ Boss **"${bossInput}"** tidak ditemukan. Gunakan autocomplete atau cek \`/bosses\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guild = ctx.guildRepo.getOrCreate(interaction.guildId);
    const now = Date.now();
    let killedAt = now;

    if (agoInput) {
      const minsAgo = parseDurationMinutes(agoInput, true);
      if (minsAgo === null) {
        await interaction.reply({
          content: `❌ Format \`ago\` tidak valid: **"${agoInput}"**. Contoh: \`10m\`, \`1h 30m\`, \`45\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      killedAt = now - minsAgo * 60_000;
    } else if (timeInput) {
      const resolved = resolveRecentTimeInZone(timeInput, guild.timezone, now);
      if (resolved === null) {
        await interaction.reply({
          content: `❌ Format jam tidak valid: **"${timeInput}"**. Gunakan format 24-jam seperti \`20:15\` atau \`08:30\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      killedAt = resolved;
    }

    const result = ctx.bossService.recordKill({
      guildId: interaction.guildId,
      bossId: boss.id,
      killedAt,
      reportedBy: interaction.user.id,
      source: 'slash',
      note,
    });

    if (!result) {
      await interaction.reply({
        content: '❌ Gagal mencatat kill boss.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.boardService.refreshBoard(interaction.guildId, true);

    const { state } = result;
    let nextText = 'Menunggu jadwal berikutnya';
    if (state.nextSpawnAt !== null) {
      nextText =
        state.windowEndAt !== null
          ? `${discordTs(state.nextSpawnAt, 'f')} – ${discordTs(state.windowEndAt, 't')} (${discordTs(state.nextSpawnAt, 'R')})`
          : `${discordTs(state.nextSpawnAt, 'f')} (${discordTs(state.nextSpawnAt, 'R')})`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`💀 Kill Tercatat: ${boss.name}`)
      .setColor(0x57f287)
      .addFields(
        { name: 'Waktu Mati', value: `${discordTs(killedAt, 'f')} (${discordTs(killedAt, 'R')})`, inline: true },
        { name: 'Pelapor', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Respawn Berikutnya', value: nextText, inline: false },
      )
      .setTimestamp(new Date());

    if (note) {
      embed.addFields({ name: 'Catatan', value: note, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
