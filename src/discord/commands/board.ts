import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { requireManagePermission } from '../permissions.js';
import { BotContext, SlashCommand } from '../types.js';

export const boardCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('board')
    .setDescription('Pasang atau kelola Live Boss Timer Board yang otomatis ter-update')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Pasang Live Boss Timer Board di channel pilihan')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel tujuan board (default: channel ini)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('refresh')
        .setDescription('Paksa perbarui tampilan Live Boss Timer Board sekarang'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Hapus dan lepas Live Boss Timer Board dari channel'),
    ),

  async execute(interaction, ctx: BotContext) {
    if (!interaction.guildId) return;
    const guild = ctx.guildRepo.getOrCreate(interaction.guildId);
    if (!(await requireManagePermission(interaction, guild))) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const targetChannel =
        interaction.options.getChannel('channel') ?? interaction.channel;

      if (
        !targetChannel ||
        !('isTextBased' in targetChannel) ||
        !targetChannel.isTextBased() ||
        !('isSendable' in targetChannel) ||
        !targetChannel.isSendable()
      ) {
        await interaction.reply({
          content: '❌ Channel tersebut tidak bisa menerima pesan bot.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        await ctx.boardService.setupBoard(interaction.guildId, targetChannel);
        await interaction.editReply({
          content: `✅ **Live Boss Timer Board** berhasil dipasang di <#${targetChannel.id}>!`,
        });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Gagal mengirim board ke <#${targetChannel.id}>. Pastikan bot punya izin **View Channel**, **Send Messages**, dan **Embed Links**.\nDetail: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
      return;
    }

    if (sub === 'refresh') {
      const refreshed = await ctx.boardService.refreshBoard(
        interaction.guildId,
        true,
      );
      await interaction.reply({
        content: refreshed
          ? '🔄 Live Board berhasil diperbarui!'
          : 'ℹ️ Live Board belum dipasang atau pesan board tidak ditemukan. Gunakan `/board setup`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'remove') {
      const removed = await ctx.boardService.removeBoard(interaction.guildId);
      await interaction.reply({
        content: removed
          ? '🗑️ Live Board berhasil dilepas dan dihapus.'
          : 'ℹ️ Tidak ada Live Board yang sedang aktif.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
