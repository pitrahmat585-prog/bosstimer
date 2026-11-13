import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { isValidTimezone, parseLeadMinutes } from '../../domain/duration.js';
import { formatMentionLabel } from '../formatters.js';
import { autocompleteTimezone } from '../interactions/autocomplete.js';
import { requireManagePermission } from '../permissions.js';
import { BotContext, SlashCommand } from '../types.js';

export const configCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Atur konfigurasi server untuk Boss Timer Bot')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Lihat pengaturan server saat ini'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channels')
        .setDescription('Atur channel notifikasi/alert boss')
        .addChannelOption((opt) =>
          opt
            .setName('alert_channel')
            .setDescription('Channel untuk mengirim pengingat & notif boss spawn')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('alerts')
        .setDescription('Atur default waktu pengingat sebelum spawn')
        .addStringOption((opt) =>
          opt
            .setName('minutes')
            .setDescription('Daftar menit dipisah koma, misal: 15,5,1 atau none')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mention')
        .setDescription('Atur default role/target ping saat pengingat boss')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Target mention default')
            .setRequired(true)
            .addChoices(
              { name: 'Role Tertentu (pilih opsi role)', value: 'role' },
              { name: '@everyone', value: 'everyone' },
              { name: '@here', value: 'here' },
              { name: 'Tidak Ada (Silent)', value: 'none' },
            ),
        )
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('Role yang akan di-ping (wajib jika mode = Role)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('timezone')
        .setDescription('Atur zona waktu server (misal Asia/Jakarta)')
        .addStringOption((opt) =>
          opt
            .setName('zone')
            .setDescription('IANA Timezone, misal: Asia/Jakarta, Asia/Makassar, UTC')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('manager-role')
        .setDescription('Atur role yang diizinkan mengelola daftar boss & config (kosongkan = hanya Admin)')
        .addRoleOption((opt) =>
          opt.setName('role').setDescription('Role officer/manager (kosongkan untuk reset ke Admin saja)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('grace')
        .setDescription('Lama status LIVE/SPAWNED bertahan (menit) sebelum jadwal bergeser')
        .addIntegerOption((opt) =>
          opt
            .setName('minutes')
            .setDescription('Jumlah menit (1 - 120)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(120),
        ),
    ),

  async autocomplete(interaction) {
    await autocompleteTimezone(interaction);
  },

  async execute(interaction, ctx: BotContext) {
    if (!interaction.guildId) return;
    const guild = ctx.guildRepo.getOrCreate(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Konfigurasi Boss Timer Server')
        .setColor(0x5865f2)
        .addFields(
          { name: 'Zona Waktu', value: `\`${guild.timezone}\``, inline: true },
          {
            name: 'Channel Alert',
            value: guild.alertChannelId ? `<#${guild.alertChannelId}>` : '*Belum diatur*',
            inline: true,
          },
          {
            name: 'Live Board',
            value: guild.boardChannelId ? `<#${guild.boardChannelId}>` : '*Belum dipasang*',
            inline: true,
          },
          {
            name: 'Default Reminder',
            value:
              guild.defaultLeadMinutes.length > 0
                ? guild.defaultLeadMinutes.map((m) => `${m}m`).join(', ')
                : 'Nonaktif',
            inline: true,
          },
          {
            name: 'Default Mention',
            value:
              guild.defaultMentionTarget === null
                ? 'Tidak Ada (Silent)'
                : formatMentionLabel(guild.defaultMentionTarget),
            inline: true,
          },
          {
            name: 'Grace Period',
            value: `${guild.spawnGraceMinutes} menit`,
            inline: true,
          },
          {
            name: 'Boss Manager Role',
            value: guild.managerRoleId ? `<@&${guild.managerRoleId}>` : '*Admin / Manage Server saja*',
            inline: false,
          },
        )
        .setTimestamp(new Date());

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await requireManagePermission(interaction, guild))) return;

    if (sub === 'channels') {
      const alertCh = interaction.options.getChannel('alert_channel');
      if (!alertCh) {
        await interaction.reply({
          content: 'ℹ️ Pilih `alert_channel` untuk mengatur channel notifikasi spawn.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      ctx.guildRepo.update(interaction.guildId, { alertChannelId: alertCh.id });
      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: `🔔 Channel alert boss diatur ke <#${alertCh.id}>.`,
      });
      return;
    }

    if (sub === 'alerts') {
      const raw = interaction.options.getString('minutes', true);
      const parsed = parseLeadMinutes(raw);
      if (parsed === null) {
        await interaction.reply({
          content: `❌ Format tidak valid: **"${raw}"**. Contoh: \`15,5,1\` atau \`none\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      ctx.guildRepo.update(interaction.guildId, { defaultLeadMinutes: parsed });
      await interaction.reply({
        content:
          parsed.length > 0
            ? `⏰ Default reminder diatur ke: **${parsed.map((m) => `${m}m`).join(', ')}** sebelum spawn.`
            : '🔕 Default reminder sebelum spawn dimatikan (tetap kirim notif saat spawn).',
      });
      return;
    }

    if (sub === 'mention') {
      const mode = interaction.options.getString('mode', true);
      const role = interaction.options.getRole('role');

      let target: string | null = null;
      if (mode === 'role') {
        if (!role) {
          await interaction.reply({
            content: '❌ Kamu memilih mode **Role Tertentu**, silakan pilih opsi `role` juga.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        target = role.id;
      } else if (mode === 'everyone') {
        target = 'everyone';
      } else if (mode === 'here') {
        target = 'here';
      } else {
        target = null;
      }

      ctx.guildRepo.update(interaction.guildId, { defaultMentionTarget: target });
      await interaction.reply({
        content: `📣 Default mention alert diatur ke: **${target === null ? 'Tidak Ada (Silent)' : formatMentionLabel(target)}**.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'timezone') {
      const zone = interaction.options.getString('zone', true).trim();
      if (!isValidTimezone(zone)) {
        await interaction.reply({
          content: `❌ Zona waktu tidak dikenali: **"${zone}"**. Contoh valid: \`Asia/Jakarta\`, \`Asia/Makassar\`, \`UTC\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      ctx.guildRepo.update(interaction.guildId, { timezone: zone });
      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: `🕒 Zona waktu server diatur ke **${zone}**.`,
      });
      return;
    }

    if (sub === 'manager-role') {
      const role = interaction.options.getRole('role');
      ctx.guildRepo.update(interaction.guildId, {
        managerRoleId: role?.id ?? null,
      });
      await interaction.reply({
        content: role
          ? `🛡️ Role <@&${role.id}> kini diizinkan mengelola daftar boss dan konfigurasi bot.`
          : '🛡️ Manager role dihapus. Hanya **Administrator / Manage Server** yang bisa mengelola daftar boss.',
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'grace') {
      const minutes = interaction.options.getInteger('minutes', true);
      ctx.guildRepo.update(interaction.guildId, { spawnGraceMinutes: minutes });
      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: `⏳ Grace period status LIVE diatur ke **${minutes} menit**.`,
      });
    }
  },
};
