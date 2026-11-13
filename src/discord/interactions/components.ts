import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  parseDurationMinutes,
  resolveRecentTimeInZone,
} from '../../domain/duration.js';
import { BOARD_CUSTOM_IDS } from '../../services/boardService.js';
import { buildStatusListEmbed, discordTs } from '../formatters.js';
import { requireManagePermission } from '../permissions.js';
import { BotContext } from '../types.js';

const MODAL_CUSTOM_KILL_ID = 'modal:custom_kill';

function formatNextSpawnSummary(
  nextSpawnAt: number | null,
  windowEndAt: number | null,
): string {
  if (nextSpawnAt === null) return 'Menunggu jadwal berikutnya';
  if (windowEndAt !== null) {
    return `${discordTs(nextSpawnAt, 'f')} – ${discordTs(windowEndAt, 't')} (${discordTs(nextSpawnAt, 'R')})`;
  }
  return `${discordTs(nextSpawnAt, 'f')} (${discordTs(nextSpawnAt, 'R')})`;
}

export async function handleSelectMenu(
  interaction: StringSelectMenuInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.guildId) return;

  if (interaction.customId === BOARD_CUSTOM_IDS.QUICK_KILL_SELECT) {
    const selectedId = Number.parseInt(interaction.values[0] ?? '', 10);
    if (!Number.isFinite(selectedId)) {
      await interaction.reply({
        content: '❌ Boss tidak valid.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = ctx.bossService.recordKill({
      guildId: interaction.guildId,
      bossId: selectedId,
      killedAt: Date.now(),
      reportedBy: interaction.user.id,
      source: 'button',
    });

    if (!result) {
      await interaction.reply({
        content: '❌ Boss tidak ditemukan atau sudah dihapus.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.boardService.refreshBoard(interaction.guildId, true);

    const { state } = result;
    await interaction.reply({
      content: `💀 **${state.boss.name}** dicatat mati sekarang oleh <@${interaction.user.id}>!\n⏰ Respawn berikutnya: ${formatNextSpawnSummary(state.nextSpawnAt, state.windowEndAt)}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleButton(
  interaction: ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.guildId) return;
  const { customId } = interaction;

  if (customId === BOARD_CUSTOM_IDS.REFRESH_BTN) {
    await interaction.deferUpdate();
    await ctx.boardService.refreshBoard(interaction.guildId, true);
    return;
  }

  if (customId === BOARD_CUSTOM_IDS.ALL_BOSSES_BTN) {
    const { guild, states } = ctx.bossService.getGuildBossStates(
      interaction.guildId,
    );
    const embed = buildStatusListEmbed(
      states,
      guild,
      '📜 Semua Boss Terdaftar',
      true,
    );
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (customId === BOARD_CUSTOM_IDS.KILL_MODAL_BTN) {
    const modal = new ModalBuilder()
      .setCustomId(MODAL_CUSTOM_KILL_ID)
      .setTitle('💀 Catat Kill Boss');

    const bossInput = new TextInputBuilder()
      .setCustomId('boss_name')
      .setLabel('Nama Boss (bisa ketik sebagian nama)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Contoh: Crimson Dragon');

    const whenInput = new TextInputBuilder()
      .setCustomId('when')
      .setLabel('Waktu Mati (kosong = sekarang)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('Contoh: 15m (menit lalu) atau 20:30');

    const noteInput = new TextInputBuilder()
      .setCustomId('note')
      .setLabel('Catatan (opsional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(150)
      .setPlaceholder('Contoh: Ch.1, solo kill');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(bossInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(whenInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
    );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('alert:kill:')) {
    const bossId = Number.parseInt(customId.slice('alert:kill:'.length), 10);
    if (!Number.isFinite(bossId)) return;

    const result = ctx.bossService.recordKill({
      guildId: interaction.guildId,
      bossId,
      killedAt: Date.now(),
      reportedBy: interaction.user.id,
      source: 'button',
    });

    if (!result) {
      await interaction.reply({
        content: '❌ Boss tidak ditemukan atau sudah dihapus.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`alert:kill:${bossId}`)
        .setLabel('Sudah Dilapor Mati')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`alert:reset:${bossId}`)
        .setLabel('Reset Timer')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.update({ components: [updatedRow] });
    await ctx.boardService.refreshBoard(interaction.guildId, true);

    const { state } = result;
    await interaction.followUp({
      content: `💀 **${state.boss.name}** ditandai mati oleh <@${interaction.user.id}>!\n⏰ Respawn berikutnya: ${formatNextSpawnSummary(state.nextSpawnAt, state.windowEndAt)}`,
    });
    return;
  }

  if (customId.startsWith('alert:reset:')) {
    const bossId = Number.parseInt(customId.slice('alert:reset:'.length), 10);
    if (!Number.isFinite(bossId)) return;

    const guild = ctx.guildRepo.getOrCreate(interaction.guildId);
    if (!(await requireManagePermission(interaction, guild))) return;

    const result = ctx.bossService.resetTimer(interaction.guildId, bossId);
    if (!result) {
      await interaction.reply({
        content: '❌ Boss tidak ditemukan.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.boardService.refreshBoard(interaction.guildId, true);
    await interaction.reply({
      content: `🔄 Timer **${result.state.boss.name}** di-reset oleh <@${interaction.user.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.guildId) return;
  if (interaction.customId !== MODAL_CUSTOM_KILL_ID) return;

  const bossNameInput = interaction.fields.getTextInputValue('boss_name').trim();
  const whenInput = interaction.fields.getTextInputValue('when').trim();
  const noteInput = interaction.fields.getTextInputValue('note').trim();

  const matches = ctx.bossRepo.findByNameOrPrefix(
    interaction.guildId,
    bossNameInput,
  );
  if (matches.length === 0) {
    await interaction.reply({
      content: `❌ Boss **"${bossNameInput}"** tidak ditemukan.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (matches.length > 1) {
    const names = matches
      .slice(0, 8)
      .map((m) => `• ${m.name}`)
      .join('\n');
    await interaction.reply({
      content: `⚠️ Ditemukan beberapa boss yang cocok dengan **"${bossNameInput}"**. Ketik nama lebih spesifik:\n${names}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const boss = matches[0]!;
  const guild = ctx.guildRepo.getOrCreate(interaction.guildId);
  const now = Date.now();
  let killedAt = now;

  if (whenInput) {
    if (/^\d{1,2}[:.]\d{2}$/.test(whenInput)) {
      const resolved = resolveRecentTimeInZone(whenInput, guild.timezone, now);
      if (resolved === null) {
        await interaction.reply({
          content: `❌ Format jam tidak valid: **"${whenInput}"**. Contoh: \`20:30\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      killedAt = resolved;
    } else {
      const minsAgo = parseDurationMinutes(whenInput, true);
      if (minsAgo === null) {
        await interaction.reply({
          content: `❌ Format waktu tidak valid: **"${whenInput}"**. Kosongkan untuk sekarang, atau isi \`15m\`, \`1h 20m\`, atau \`20:30\`.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      killedAt = now - minsAgo * 60_000;
    }
  }

  const result = ctx.bossService.recordKill({
    guildId: interaction.guildId,
    bossId: boss.id,
    killedAt,
    reportedBy: interaction.user.id,
    source: 'modal',
    note: noteInput || null,
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
  await interaction.reply({
    content: `💀 **${boss.name}** dicatat mati (${discordTs(killedAt, 'R')}) oleh <@${interaction.user.id}>!\n⏰ Respawn berikutnya: ${formatNextSpawnSummary(state.nextSpawnAt, state.windowEndAt)}`,
    flags: MessageFlags.Ephemeral,
  });
}
