import { EmbedBuilder, MessageMentionOptions } from 'discord.js';
import { formatDuration, formatScheduleDays } from '../domain/duration.js';
import {
  BossRecord,
  BossStatus,
  ComputedBossState,
  GuildConfig,
  KillLogRecord,
} from '../domain/types.js';

export function discordTs(
  ms: number,
  style: 'R' | 't' | 'T' | 'f' | 'F' | 'd' | 'D' = 'R',
): string {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

export function formatMentionContent(target: string | null): string {
  if (!target || target === 'none') return '';
  if (target === 'everyone') return '@everyone';
  if (target === 'here') return '@here';
  return `<@&${target}>`;
}

export function formatMentionLabel(target: string | null): string {
  if (!target) return 'Ikuti Default Server';
  if (target === 'none') return 'Tidak Ada (Silent)';
  if (target === 'everyone') return '@everyone';
  if (target === 'here') return '@here';
  return `<@&${target}>`;
}

export function buildAllowedMentions(target: string | null): MessageMentionOptions {
  if (!target || target === 'none') {
    return { parse: [] };
  }
  if (target === 'everyone' || target === 'here') {
    return { parse: ['everyone'] };
  }
  return { roles: [target] };
}

export function getStatusBadge(status: BossStatus): string {
  switch (status) {
    case 'window_open':
      return '🟡 WINDOW OPEN';
    case 'spawned':
      return '🔴 LIVE / SPAWNED';
    case 'overdue':
      return '🟠 BELUM MATI';
    case 'soon':
      return '⚡ SEGERA SPAWN';
    case 'upcoming':
      return '🟢 TERJADWAL';
    case 'untracked':
      return '⚪ MENUNGGU KILL';
    case 'disabled':
      return '⚫ NONAKTIF';
  }
}

export function getStatusEmoji(status: BossStatus): string {
  switch (status) {
    case 'window_open':
      return '🟡';
    case 'spawned':
      return '🔴';
    case 'overdue':
      return '🟠';
    case 'soon':
      return '⚡';
    case 'upcoming':
      return '🟢';
    case 'untracked':
      return '⚪';
    case 'disabled':
      return '⚫';
  }
}

export function formatBossRuleSummary(boss: BossRecord, timezone: string): string {
  if (boss.mode === 'cooldown') {
    const minStr = formatDuration(boss.respawnMinutes ?? 0);
    if (boss.respawnMaxMinutes && boss.respawnMaxMinutes > (boss.respawnMinutes ?? 0)) {
      return `Cooldown ${minStr} – ${formatDuration(boss.respawnMaxMinutes)}`;
    }
    return `Cooldown ${minStr}`;
  }

  const times = (boss.scheduleTimes ?? []).join(', ') || '-';
  if (boss.scheduleIntervalDays && boss.scheduleIntervalDays >= 2) {
    return `Jadwal: Setiap ${boss.scheduleIntervalDays} Hari • ${times} (${timezone})`;
  }
  const days = formatScheduleDays(boss.scheduleDays ?? []);
  return `Jadwal: ${days} • ${times} (${timezone})`;
}

export function formatBoardLine(state: ComputedBossState, timezone: string): string {
  const { boss, status, nextSpawnAt, windowEndAt, isManualOverride } = state;
  const emoji = getStatusEmoji(status);
  const metaParts: string[] = [boss.category];
  if (boss.location) metaParts.push(`📍 ${boss.location}`);
  const metaText = metaParts.join(' • ');
  const manualTag = isManualOverride ? ' *(manual)*' : '';

  let timingText = '';
  if (status === 'window_open' && nextSpawnAt !== null && windowEndAt !== null) {
    timingText = `**WINDOW BUKA** (tutup ${discordTs(windowEndAt, 'R')} • ${discordTs(windowEndAt, 't')})`;
  } else if (status === 'spawned' && nextSpawnAt !== null) {
    timingText = `**LIVE / SPAWNED** (${discordTs(nextSpawnAt, 'R')} • ${discordTs(nextSpawnAt, 't')})`;
  } else if (status === 'overdue' && nextSpawnAt !== null) {
    const ref = windowEndAt ?? nextSpawnAt;
    timingText = `**BELUM DILAPOR MATI** (spawn ${discordTs(ref, 'R')})`;
  } else if ((status === 'soon' || status === 'upcoming') && nextSpawnAt !== null) {
    if (windowEndAt !== null) {
      timingText = `${discordTs(nextSpawnAt, 'R')} (${discordTs(nextSpawnAt, 't')} – ${discordTs(windowEndAt, 't')})`;
    } else {
      timingText = `${discordTs(nextSpawnAt, 'R')} (${discordTs(nextSpawnAt, 'f')})`;
    }
  } else if (status === 'untracked') {
    timingText = `Menunggu laporan \`/kill\` *(${formatBossRuleSummary(boss, timezone)})*`;
  } else {
    timingText = 'Nonaktif';
  }

  return `${emoji} **${boss.name}**${manualTag} — ${timingText}\n┗ *${metaText}*`;
}

export function buildStatusListEmbed(
  states: ComputedBossState[],
  guild: GuildConfig,
  title = '📋 Daftar Status Boss',
  includeDisabled = false,
): EmbedBuilder {
  const visible = includeDisabled
    ? states
    : states.filter((s) => s.status !== 'disabled');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865f2)
    .setTimestamp(new Date());

  if (visible.length === 0) {
    embed.setDescription(
      'Belum ada boss yang terdaftar.\nGunakan `/boss add-cooldown`, `/boss add-schedule`, atau `/boss seed` untuk memulai!',
    );
    return embed;
  }

  const lines: string[] = [];
  let charCount = 0;
  let truncatedCount = 0;

  for (const st of visible) {
    const line = formatBoardLine(st, guild.timezone);
    if (charCount + line.length + 2 > 3800) {
      truncatedCount++;
      continue;
    }
    lines.push(line);
    charCount += line.length + 2;
  }

  let description = lines.join('\n');
  if (truncatedCount > 0) {
    description += `\n\n*...dan ${truncatedCount} boss lainnya. Gunakan \`/timer info <boss>\` untuk detail.*`;
  }

  embed.setDescription(description);
  embed.setFooter({
    text: `Zona Waktu: ${guild.timezone} • Total ditampilkan: ${visible.length - truncatedCount}/${visible.length}`,
  });
  return embed;
}

export function buildBossInfoEmbed(
  state: ComputedBossState,
  guild: GuildConfig,
  logs: KillLogRecord[],
): EmbedBuilder {
  const { boss, status, nextSpawnAt, windowEndAt, effectiveLeadMinutes, effectiveMentionTarget } =
    state;

  const colorMap: Record<BossStatus, number> = {
    window_open: 0xfee75c,
    spawned: 0xed4245,
    overdue: 0xe67e22,
    soon: 0xf1c40f,
    upcoming: 0x57f287,
    untracked: 0x99aab5,
    disabled: 0x4f545c,
  };

  const embed = new EmbedBuilder()
    .setTitle(`🐉 ${boss.name}`)
    .setColor(colorMap[status])
    .addFields(
      { name: 'Status', value: getStatusBadge(status), inline: true },
      { name: 'Kategori', value: boss.category, inline: true },
      { name: 'Lokasi', value: boss.location ?? '-', inline: true },
      {
        name: 'Aturan Respawn',
        value: formatBossRuleSummary(boss, guild.timezone),
        inline: false,
      },
    )
    .setTimestamp(new Date());

  if (nextSpawnAt !== null) {
    const windowStr =
      windowEndAt !== null
        ? `${discordTs(nextSpawnAt, 'F')} (${discordTs(nextSpawnAt, 'R')})\ns/d ${discordTs(windowEndAt, 't')} (${discordTs(windowEndAt, 'R')})`
        : `${discordTs(nextSpawnAt, 'F')} (${discordTs(nextSpawnAt, 'R')})`;
    embed.addFields({
      name: state.isManualOverride ? 'Timer Berikutnya (Manual)' : 'Spawn Berikutnya',
      value: windowStr,
      inline: false,
    });
  }

  if (boss.lastKilledAt !== null) {
    embed.addFields({
      name: 'Kill Terakhir',
      value: `${discordTs(boss.lastKilledAt, 'F')} (${discordTs(boss.lastKilledAt, 'R')}) oleh ${boss.lastKilledBy ? `<@${boss.lastKilledBy}>` : 'Unknown'}`,
      inline: false,
    });
  }

  embed.addFields(
    {
      name: 'Reminder',
      value:
        effectiveLeadMinutes.length > 0
          ? effectiveLeadMinutes.map((m) => `${m}m`).join(', ')
          : 'Tidak ada',
      inline: true,
    },
    {
      name: 'Mention Target',
      value: boss.mentionTarget
        ? formatMentionLabel(boss.mentionTarget)
        : `Default (${formatMentionLabel(effectiveMentionTarget)})`,
      inline: true,
    },
  );

  if (boss.notes) {
    embed.addFields({ name: 'Catatan', value: boss.notes, inline: false });
  }

  if (logs.length > 0) {
    const historyLines = logs.map((l) => {
      const noteText = l.note ? ` — *"${l.note}"*` : '';
      return `• ${discordTs(l.killedAt, 'f')} oleh <@${l.reportedBy}> (${l.source})${noteText}`;
    });
    embed.addFields({
      name: 'Riwayat Terakhir',
      value: historyLines.join('\n').slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

export function buildAlertEmbed(
  state: ComputedBossState,
  alertType: string,
  guild: GuildConfig,
): EmbedBuilder {
  const { boss, nextSpawnAt, windowEndAt } = state;
  const locationLine = boss.location ? `\n📍 **Lokasi:** ${boss.location}` : '';
  const notesLine = boss.notes ? `\n📝 **Catatan:** ${boss.notes}` : '';

  if (alertType === 'spawn') {
    const isWindow = windowEndAt !== null;
    const title = isWindow
      ? `🟡 WINDOW RESPAWN DIBUKA: ${boss.name}`
      : `🔥 BOSS SPAWNED: ${boss.name}`;
    const desc = isWindow
      ? `**${boss.name}** \`[${boss.category}]\` memasuki window spawn!${locationLine}\n⏳ **Tutup window:** ${discordTs(windowEndAt!, 't')} (${discordTs(windowEndAt!, 'R')})${notesLine}`
      : `**${boss.name}** \`[${boss.category}]\` waktunya spawn sekarang!${locationLine}\n🕒 **Waktu Spawn:** ${nextSpawnAt ? discordTs(nextSpawnAt, 't') : '-'}${notesLine}`;

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setColor(isWindow ? 0xfee75c : 0xed4245)
      .setFooter({ text: `Zona Waktu: ${guild.timezone}` })
      .setTimestamp(new Date());
  }

  if (alertType === 'window_close') {
    return new EmbedBuilder()
      .setTitle(`🔴 MAX WINDOW TERCAPAI: ${boss.name}`)
      .setDescription(
        `Window respawn **${boss.name}** \`[${boss.category}]\` sudah mencapai batas akhir! Boss seharusnya sudah spawn.${locationLine}${notesLine}`,
      )
      .setColor(0xed4245)
      .setFooter({ text: `Zona Waktu: ${guild.timezone}` })
      .setTimestamp(new Date());
  }

  const mins = alertType.replace('lead_', '');
  const spawnTimeLine =
    nextSpawnAt !== null
      ? `\n⏰ **Estimasi Spawn:** ${discordTs(nextSpawnAt, 'R')} (${discordTs(nextSpawnAt, 't')})`
      : '';

  return new EmbedBuilder()
    .setTitle(`⚡ PENGINGAT BOSS (${mins} MENIT LAGI): ${boss.name}`)
    .setDescription(
      `**${boss.name}** \`[${boss.category}]\` akan segera ${windowEndAt ? 'membuka window respawn' : 'spawn'}!${spawnTimeLine}${locationLine}${notesLine}`,
    )
    .setColor(0xf1c40f)
    .setFooter({ text: `Zona Waktu: ${guild.timezone}` })
    .setTimestamp(new Date());
}

export function buildBatchedAlertEmbed(
  states: ComputedBossState[],
  alertType: string,
  guild: GuildConfig,
): EmbedBuilder {
  const first = states[0]!;
  if (states.length === 1) {
    return buildAlertEmbed(first, alertType, guild);
  }

  const namesList = states.map((s) => s.boss.name).join(', ');
  const bossLines = states
    .map((s) => {
      const loc = s.boss.location ? ` *(${s.boss.location})*` : '';
      return `• **${s.boss.name}** \`[${s.boss.category}]\`${loc}`;
    })
    .join('\n');

  const nextSpawnAt = first.nextSpawnAt;

  if (alertType === 'spawn') {
    return new EmbedBuilder()
      .setTitle(`🔥 BOSS SPAWNED (${states.length} BOSS): ${namesList}`.slice(0, 256))
      .setDescription(
        `${bossLines}\n\n🕒 **Waktu Spawn:** ${nextSpawnAt ? discordTs(nextSpawnAt, 't') : '-'}`,
      )
      .setColor(0xed4245)
      .setFooter({ text: `Zona Waktu: ${guild.timezone}` })
      .setTimestamp(new Date());
  }

  if (alertType === 'window_close') {
    return new EmbedBuilder()
      .setTitle(`🔴 MAX WINDOW TERCAPAI (${states.length} BOSS)`.slice(0, 256))
      .setDescription(bossLines)
      .setColor(0xed4245)
      .setFooter({ text: `Zona Waktu: ${guild.timezone}` })
      .setTimestamp(new Date());
  }

  const mins = alertType.replace('lead_', '');
  const spawnTimeLine =
    nextSpawnAt !== null
      ? `\n\n⏰ **Estimasi Spawn:** ${discordTs(nextSpawnAt, 'R')} (${discordTs(nextSpawnAt, 't')})`
      : '';

  return new EmbedBuilder()
    .setTitle(`⚡ PENGINGAT BOSS (${mins} MENIT LAGI): ${states.length} Boss`.slice(0, 256))
    .setDescription(`${bossLines}${spawnTimeLine}`)
    .setColor(0xf1c40f)
    .setFooter({ text: `Zona Waktu: ${guild.timezone}` })
    .setTimestamp(new Date());
}
