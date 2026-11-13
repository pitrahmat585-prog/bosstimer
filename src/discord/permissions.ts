import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { GuildConfig } from '../domain/types.js';

type GuildInteraction = ChatInputCommandInteraction | ButtonInteraction;

function hasRole(member: GuildInteraction['member'], roleId: string): boolean {
  if (!member) return false;
  if (member instanceof GuildMember) {
    return member.roles.cache.has(roleId);
  }
  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId);
  }
  return false;
}

export function canManageBosses(
  interaction: GuildInteraction,
  guildConfig: GuildConfig,
): boolean {
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  if (guildConfig.managerRoleId && hasRole(interaction.member, guildConfig.managerRoleId)) {
    return true;
  }

  return false;
}

export async function requireManagePermission(
  interaction: GuildInteraction,
  guildConfig: GuildConfig,
): Promise<boolean> {
  if (canManageBosses(interaction, guildConfig)) {
    return true;
  }

  const roleHint = guildConfig.managerRoleId
    ? ` atau memiliki role <@&${guildConfig.managerRoleId}>`
    : '';
  await interaction.reply({
    content: `❌ Kamu memerlukan izin **Manage Server / Administrator**${roleHint} untuk menjalankan aksi ini.`,
    flags: MessageFlags.Ephemeral,
  });
  return false;
}
