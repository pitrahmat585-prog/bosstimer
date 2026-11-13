import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { DateTime } from 'luxon';
import {
  formatDuration,
  formatScheduleDays,
  parseDurationMinutes,
  parseEveryNDays,
  parseLeadMinutes,
  parseScheduleDays,
  parseScheduleTimes,
} from '../../domain/duration.js';
import { PresetPackId } from '../../services/presetData.js';
import { autocompleteBossName } from '../interactions/autocomplete.js';
import { requireManagePermission } from '../permissions.js';
import { BotContext, SlashCommand } from '../types.js';

export const bossCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('boss')
    .setDescription('Kelola daftar boss (tambah, edit, hapus, template, import/export)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add-cooldown')
        .setDescription('Tambah boss dengan sistem cooldown setelah mati')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nama boss').setRequired(true).setMaxLength(80),
        )
        .addStringOption((opt) =>
          opt
            .setName('respawn')
            .setDescription('Durasi respawn minimum, misal: 2h, 90m, 1h 30m')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('respawn_max')
            .setDescription('Opsional: batas atas random spawn window, misal: 2h 30m'),
        )
        .addStringOption((opt) =>
          opt.setName('category').setDescription('Kategori (default: World Boss)').setMaxLength(40),
        )
        .addStringOption((opt) =>
          opt.setName('location').setDescription('Lokasi/map/channel boss').setMaxLength(80),
        )
        .addStringOption((opt) =>
          opt
            .setName('alerts')
            .setDescription('Reminder menit sebelum spawn, misal: 15,5,1 atau none'),
        )
        .addRoleOption((opt) =>
          opt.setName('mention_role').setDescription('Role khusus yang di-ping untuk boss ini'),
        )
        .addStringOption((opt) =>
          opt.setName('notes').setDescription('Catatan tambahan').setMaxLength(200),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-schedule')
        .setDescription('Tambah boss dengan jadwal hari & jam tetap')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nama boss').setRequired(true).setMaxLength(80),
        )
        .addStringOption((opt) =>
          opt
            .setName('days')
            .setDescription('Hari: daily, sen,rab,jum, atau "2 hari sekali"')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('times')
            .setDescription('Jam spawn (24-jam), misal: 08:15,11:15,20:15,23:15')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('category').setDescription('Kategori (default: World Boss)').setMaxLength(40),
        )
        .addStringOption((opt) =>
          opt.setName('location').setDescription('Lokasi/map/channel boss').setMaxLength(80),
        )
        .addStringOption((opt) =>
          opt
            .setName('alerts')
            .setDescription('Reminder menit sebelum spawn, misal: 15,5,1 atau none'),
        )
        .addRoleOption((opt) =>
          opt.setName('mention_role').setDescription('Role khusus yang di-ping untuk boss ini'),
        )
        .addStringOption((opt) =>
          opt.setName('notes').setDescription('Catatan tambahan').setMaxLength(200),
        )
        .addStringOption((opt) =>
          opt
            .setName('start_date')
            .setDescription('Opsional untuk jadwal N-hari: tanggal acuan YYYY-MM-DD'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit pengaturan boss yang sudah ada')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Pilih boss yang ingin diedit')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt.setName('new_name').setDescription('Nama baru boss').setMaxLength(80),
        )
        .addStringOption((opt) =>
          opt.setName('respawn').setDescription('Durasi respawn baru (mode cooldown)'),
        )
        .addStringOption((opt) =>
          opt
            .setName('respawn_max')
            .setDescription('Batas atas window baru (isi "none" untuk hapus window)'),
        )
        .addStringOption((opt) =>
          opt.setName('days').setDescription('Hari spawn baru (mode schedule)'),
        )
        .addStringOption((opt) =>
          opt.setName('times').setDescription('Jam spawn baru (mode schedule)'),
        )
        .addStringOption((opt) =>
          opt.setName('category').setDescription('Kategori baru').setMaxLength(40),
        )
        .addStringOption((opt) =>
          opt.setName('location').setDescription('Lokasi baru (isi "-" untuk hapus)').setMaxLength(80),
        )
        .addStringOption((opt) =>
          opt.setName('alerts').setDescription('Reminder baru, misal 15,5,1 atau "default"'),
        )
        .addRoleOption((opt) =>
          opt.setName('mention_role').setDescription('Role mention baru'),
        )
        .addStringOption((opt) =>
          opt
            .setName('mention_mode')
            .setDescription('Override mode mention')
            .addChoices(
              { name: 'Ikuti Default Server', value: 'inherit' },
              { name: '@everyone', value: 'everyone' },
              { name: '@here', value: 'here' },
              { name: 'Silent (Tanpa Ping)', value: 'none' },
            ),
        )
        .addStringOption((opt) =>
          opt.setName('notes').setDescription('Catatan baru (isi "-" untuk hapus)').setMaxLength(200),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Hapus boss dari daftar')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Nama boss yang akan dihapus')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Aktifkan atau nonaktifkan boss sementara')
        .addStringOption((opt) =>
          opt
            .setName('boss')
            .setDescription('Nama boss')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('Aktifkan boss ini?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('seed')
        .setDescription('Isi daftar boss otomatis dari template preset')
        .addStringOption((opt) =>
          opt
            .setName('preset')
            .setDescription('Pilih preset boss yang ingin dimuat')
            .addChoices(
              {
                name: 'Architect: Field Boss Group I (1 Timer Ringkas)',
                value: 'architect_g1_single',
              },
              {
                name: 'Architect: Field Boss Group I (Karugura, Tagar, Gigas)',
                value: 'architect_g1_all',
              },
              {
                name: 'Architect: World Boss (Agarash, Shahgar, Behemoth)',
                value: 'architect_world_boss',
              },
              {
                name: "Architect: Giant's Tower 1F-3F (Gishkal, Halpasiam, Drugamu)",
                value: 'architect_tower',
              },
              {
                name: 'Architect: Semua Paket (Field Boss I + World + Tower)',
                value: 'architect_all',
              },
              {
                name: 'Template Umum (Contoh Hybrid)',
                value: 'starter',
              },
            ),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('overwrite')
            .setDescription('Timpa jadwal boss jika namanya sudah ada (default: tidak)'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('export')
        .setDescription('Ekspor seluruh konfigurasi boss server ini ke file JSON'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('import')
        .setDescription('Impor daftar boss dari file JSON')
        .addAttachmentOption((opt) =>
          opt
            .setName('file')
            .setDescription('File .json hasil export atau template custom')
            .setRequired(true),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('overwrite')
            .setDescription('Timpa boss jika namanya sudah ada (default: tidak)'),
        ),
    ),

  async autocomplete(interaction, ctx) {
    await autocompleteBossName(interaction, ctx);
  },

  async execute(interaction, ctx: BotContext) {
    if (!interaction.guildId) return;
    const guild = ctx.guildRepo.getOrCreate(interaction.guildId);
    if (!(await requireManagePermission(interaction, guild))) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'add-cooldown') {
      const name = interaction.options.getString('name', true).trim();
      const respawnRaw = interaction.options.getString('respawn', true);
      const respawnMaxRaw = interaction.options.getString('respawn_max');
      const category = interaction.options.getString('category') ?? 'World Boss';
      const location = interaction.options.getString('location');
      const alertsRaw = interaction.options.getString('alerts');
      const mentionRole = interaction.options.getRole('mention_role');
      const notes = interaction.options.getString('notes');

      if (ctx.bossRepo.getByName(interaction.guildId, name)) {
        await interaction.reply({
          content: `❌ Boss dengan nama **"${name}"** sudah ada di server ini.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const respawnMinutes = parseDurationMinutes(respawnRaw, false);
      if (respawnMinutes === null) {
        await interaction.reply({
          content: `❌ Format respawn tidak valid: **"${respawnRaw}"**. Contoh: \`2h\`, \`90m\`, \`1h 30m\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      let respawnMaxMinutes: number | null = null;
      if (respawnMaxRaw) {
        respawnMaxMinutes = parseDurationMinutes(respawnMaxRaw, false);
        if (respawnMaxMinutes === null || respawnMaxMinutes <= respawnMinutes) {
          await interaction.reply({
            content: `❌ \`respawn_max\` harus lebih besar dari \`respawn\` (${formatDuration(respawnMinutes)}).`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      let leadMinutes: number[] | null = null;
      if (alertsRaw) {
        leadMinutes = parseLeadMinutes(alertsRaw);
        if (leadMinutes === null) {
          await interaction.reply({
            content: `❌ Format reminder tidak valid: **"${alertsRaw}"**. Contoh: \`15,5,1\` atau \`none\`.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      const created = ctx.bossRepo.create({
        guildId: interaction.guildId,
        name,
        mode: 'cooldown',
        category,
        location,
        respawnMinutes,
        respawnMaxMinutes,
        leadMinutes,
        mentionTarget: mentionRole?.id ?? null,
        notes,
      });

      await ctx.boardService.refreshBoard(interaction.guildId, true);

      const windowText = respawnMaxMinutes
        ? `${formatDuration(respawnMinutes)} – ${formatDuration(respawnMaxMinutes)}`
        : formatDuration(respawnMinutes);
      await interaction.reply({
        content: `✅ Boss cooldown **${created.name}** (\`${created.category}\`) ditambahkan! Respawn: **${windowText}**.\nGunakan \`/kill ${created.name}\` saat boss mati untuk memulai timer.`,
      });
      return;
    }

    if (sub === 'add-schedule') {
      const name = interaction.options.getString('name', true).trim();
      const daysRaw = interaction.options.getString('days', true);
      const timesRaw = interaction.options.getString('times', true);
      const category = interaction.options.getString('category') ?? 'World Boss';
      const location = interaction.options.getString('location');
      const alertsRaw = interaction.options.getString('alerts');
      const mentionRole = interaction.options.getRole('mention_role');
      const notes = interaction.options.getString('notes');
      const startDateRaw = interaction.options.getString('start_date')?.trim();

      if (ctx.bossRepo.getByName(interaction.guildId, name)) {
        await interaction.reply({
          content: `❌ Boss dengan nama **"${name}"** sudah ada di server ini.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const intervalDays = parseEveryNDays(daysRaw);
      const scheduleDays = intervalDays ? null : parseScheduleDays(daysRaw);
      if (!intervalDays && !scheduleDays) {
        await interaction.reply({
          content: `❌ Format hari tidak valid: **"${daysRaw}"**. Contoh: \`daily\`, \`sen,rab,jum\`, atau \`2 hari sekali\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      let anchorDate: string | null = null;
      if (intervalDays) {
        if (startDateRaw) {
          const parsedDate = DateTime.fromISO(startDateRaw, { zone: guild.timezone });
          if (!parsedDate.isValid) {
            await interaction.reply({
              content: `❌ Format \`start_date\` tidak valid: **"${startDateRaw}"**. Gunakan \`YYYY-MM-DD\`.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          anchorDate = parsedDate.toISODate();
        } else {
          anchorDate = DateTime.now().setZone(guild.timezone).toISODate();
        }
      }

      const scheduleTimes = parseScheduleTimes(timesRaw);
      if (!scheduleTimes) {
        await interaction.reply({
          content: `❌ Format jam tidak valid: **"${timesRaw}"**. Contoh: \`00:15,08:15,16:15\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      let leadMinutes: number[] | null = null;
      if (alertsRaw) {
        leadMinutes = parseLeadMinutes(alertsRaw);
        if (leadMinutes === null) {
          await interaction.reply({
            content: `❌ Format reminder tidak valid: **"${alertsRaw}"**. Contoh: \`15,5,1\` atau \`none\`.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      const created = ctx.bossRepo.create({
        guildId: interaction.guildId,
        name,
        mode: 'schedule',
        category,
        location,
        scheduleDays,
        scheduleTimes,
        scheduleIntervalDays: intervalDays,
        scheduleAnchorDate: anchorDate,
        leadMinutes,
        mentionTarget: mentionRole?.id ?? null,
        notes,
      });

      await ctx.boardService.refreshBoard(interaction.guildId, true);

      const dayDesc = intervalDays
        ? `Setiap ${intervalDays} Hari (mulai ${anchorDate})`
        : formatScheduleDays(scheduleDays ?? []);
      await interaction.reply({
        content: `✅ Boss jadwal **${created.name}** ditambahkan!\n📅 **${dayDesc}** pukul **${scheduleTimes.join(', ')}** (${guild.timezone})`,
      });
      return;
    }

    if (sub === 'edit') {
      const bossInput = interaction.options.getString('boss', true);
      const boss = ctx.bossService.resolveBossByInput(interaction.guildId, bossInput);
      if (!boss) {
        await interaction.reply({
          content: `❌ Boss **"${bossInput}"** tidak ditemukan.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newName = interaction.options.getString('new_name')?.trim();
      if (
        newName &&
        newName.toLowerCase() !== boss.name.toLowerCase() &&
        ctx.bossRepo.getByName(interaction.guildId, newName)
      ) {
        await interaction.reply({
          content: `❌ Sudah ada boss lain bernama **"${newName}"**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const respawnRaw = interaction.options.getString('respawn');
      const respawnMaxRaw = interaction.options.getString('respawn_max');
      const daysRaw = interaction.options.getString('days');
      const timesRaw = interaction.options.getString('times');
      const category = interaction.options.getString('category');
      const locationRaw = interaction.options.getString('location');
      const alertsRaw = interaction.options.getString('alerts');
      const mentionRole = interaction.options.getRole('mention_role');
      const mentionMode = interaction.options.getString('mention_mode');
      const notesRaw = interaction.options.getString('notes');

      let nextRespawn = boss.respawnMinutes;
      let nextRespawnMax = boss.respawnMaxMinutes;
      let nextDays = boss.scheduleDays;
      let nextTimes = boss.scheduleTimes;
      let nextIntervalDays = boss.scheduleIntervalDays;
      let nextAnchorDate = boss.scheduleAnchorDate;
      let nextMode = boss.mode;

      if (respawnRaw) {
        const mins = parseDurationMinutes(respawnRaw, false);
        if (mins === null) {
          await interaction.reply({
            content: `❌ Format \`respawn\` tidak valid: **"${respawnRaw}"**.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        nextMode = 'cooldown';
        nextRespawn = mins;
      }

      if (respawnMaxRaw) {
        if (respawnMaxRaw.trim().toLowerCase() === 'none') {
          nextRespawnMax = null;
        } else {
          const maxMins = parseDurationMinutes(respawnMaxRaw, false);
          if (maxMins === null || (nextRespawn !== null && maxMins <= nextRespawn)) {
            await interaction.reply({
              content: '❌ `respawn_max` harus valid dan lebih besar dari `respawn`.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          nextRespawnMax = maxMins;
        }
      }

      if (daysRaw) {
        const interval = parseEveryNDays(daysRaw);
        const parsedDays = interval ? null : parseScheduleDays(daysRaw);
        if (!interval && !parsedDays) {
          await interaction.reply({
            content: `❌ Format \`days\` tidak valid: **"${daysRaw}"**. Contoh: \`daily\`, \`sen,rab,jum\`, atau \`2 hari sekali\`.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        nextIntervalDays = interval;
        nextAnchorDate = interval
          ? DateTime.now().setZone(guild.timezone).toISODate()
          : null;
        nextDays = parsedDays;
        if (timesRaw || boss.mode === 'schedule') nextMode = 'schedule';
      }

      if (timesRaw) {
        const parsedTimes = parseScheduleTimes(timesRaw);
        if (!parsedTimes) {
          await interaction.reply({
            content: `❌ Format \`times\` tidak valid: **"${timesRaw}"**.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        nextTimes = parsedTimes;
        if (daysRaw || boss.mode === 'schedule') nextMode = 'schedule';
      }

      const hasValidDays = Boolean(nextDays?.length) || (nextIntervalDays !== null && nextIntervalDays >= 2);
      if (nextMode === 'schedule' && (!hasValidDays || !nextTimes?.length)) {
        await interaction.reply({
          content: '❌ Untuk beralih ke mode jadwal, wajib isi `days` dan `times`.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      let nextLeadMinutes = boss.leadMinutes;
      if (alertsRaw) {
        if (alertsRaw.trim().toLowerCase() === 'default') {
          nextLeadMinutes = null;
        } else {
          const parsedLead = parseLeadMinutes(alertsRaw);
          if (parsedLead === null) {
            await interaction.reply({
              content: `❌ Format \`alerts\` tidak valid: **"${alertsRaw}"**.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          nextLeadMinutes = parsedLead;
        }
      }

      let nextMentionTarget = boss.mentionTarget;
      if (mentionMode === 'inherit') {
        nextMentionTarget = null;
      } else if (mentionMode) {
        nextMentionTarget = mentionMode;
      } else if (mentionRole) {
        nextMentionTarget = mentionRole.id;
      }

      const updated = ctx.bossRepo.update(boss.id, interaction.guildId, {
        name: newName,
        mode: nextMode,
        category: category ?? undefined,
        location: locationRaw !== null ? (locationRaw.trim() === '-' ? null : locationRaw) : undefined,
        respawnMinutes: nextMode === 'cooldown' ? nextRespawn : null,
        respawnMaxMinutes: nextMode === 'cooldown' ? nextRespawnMax : null,
        scheduleDays: nextMode === 'schedule' ? nextDays : null,
        scheduleTimes: nextMode === 'schedule' ? nextTimes : null,
        scheduleIntervalDays: nextMode === 'schedule' ? nextIntervalDays : null,
        scheduleAnchorDate: nextMode === 'schedule' ? nextAnchorDate : null,
        leadMinutes: nextLeadMinutes,
        mentionTarget: nextMentionTarget,
        notes: notesRaw !== null ? (notesRaw.trim() === '-' ? null : notesRaw) : undefined,
      });

      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: `✏️ Boss **${updated?.name ?? boss.name}** berhasil diperbarui!`,
      });
      return;
    }

    if (sub === 'delete') {
      const bossInput = interaction.options.getString('boss', true);
      const boss = ctx.bossService.resolveBossByInput(interaction.guildId, bossInput);
      if (!boss) {
        await interaction.reply({
          content: `❌ Boss **"${bossInput}"** tidak ditemukan.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      ctx.bossRepo.delete(boss.id, interaction.guildId);
      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: `🗑️ Boss **${boss.name}** berhasil dihapus.`,
      });
      return;
    }

    if (sub === 'toggle') {
      const bossInput = interaction.options.getString('boss', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      const boss = ctx.bossService.resolveBossByInput(interaction.guildId, bossInput);
      if (!boss) {
        await interaction.reply({
          content: `❌ Boss **"${bossInput}"** tidak ditemukan.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      ctx.bossRepo.update(boss.id, interaction.guildId, { enabled });
      await ctx.boardService.refreshBoard(interaction.guildId, true);
      await interaction.reply({
        content: enabled
          ? `✅ Boss **${boss.name}** diaktifkan.`
          : `⏸️ Boss **${boss.name}** dinonaktifkan.`,
      });
      return;
    }

    if (sub === 'seed') {
      const preset = (interaction.options.getString('preset') ??
        'architect_g1_single') as PresetPackId;
      const overwrite = interaction.options.getBoolean('overwrite') ?? false;
      const result = ctx.bossService.seedStarterBosses(
        interaction.guildId,
        preset,
        overwrite,
      );
      await ctx.boardService.refreshBoard(interaction.guildId, true);

      const parts: string[] = [];
      if (result.added.length > 0) {
        parts.push(`✅ Ditambahkan (${result.added.length}): **${result.added.join(', ')}**`);
      }
      if (result.updated.length > 0) {
        parts.push(`✏️ Diperbarui (${result.updated.length}): **${result.updated.join(', ')}**`);
      }
      if (result.skipped.length > 0) {
        parts.push(`⏭️ Sudah ada (${result.skipped.length}): ${result.skipped.join(', ')}`);
      }
      await interaction.reply({
        content:
          parts.join('\n') || 'Semua template boss sudah ada di server ini.',
      });
      return;
    }

    if (sub === 'export') {
      const data = ctx.bossService.exportBosses(interaction.guildId);
      const json = JSON.stringify(data, null, 2);
      const file = new AttachmentBuilder(Buffer.from(json, 'utf-8'), {
        name: `bosses-${interaction.guildId}.json`,
      });
      await interaction.reply({
        content: `📦 Berhasil mengekspor **${data.length}** boss.`,
        files: [file],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'import') {
      const attachment = interaction.options.getAttachment('file', true);
      const overwrite = interaction.options.getBoolean('overwrite') ?? false;

      if (attachment.size > 512 * 1024) {
        await interaction.reply({
          content: '❌ Ukuran file maksimal 512 KB.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const res = await fetch(attachment.url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const rawText = await res.text();
        const result = ctx.bossService.importBosses(
          interaction.guildId,
          rawText,
          overwrite,
        );
        await ctx.boardService.refreshBoard(interaction.guildId, true);

        const summary = [
          `📥 **Import Selesai**`,
          `• Baru ditambahkan: **${result.created}**`,
          `• Diperbarui: **${result.updated}**`,
        ];
        if (result.errors.length > 0) {
          summary.push(
            `• Catatan/dilewati (${result.errors.length}):\n${result.errors.slice(0, 8).map((e) => `  - ${e}`).join('\n')}`,
          );
        }

        await interaction.editReply({ content: summary.join('\n') });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Gagal mengimpor file JSON: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }
  },
};
