import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { BossRepo } from '../db/bossRepo.js';
import { GuildRepo } from '../db/guildRepo.js';
import { AlertService } from '../services/alertService.js';
import { BoardService } from '../services/boardService.js';
import { BossService } from '../services/bossService.js';

export interface BotContext {
  guildRepo: GuildRepo;
  bossRepo: BossRepo;
  bossService: BossService;
  boardService: BoardService;
  alertService: AlertService;
}

export type AnySlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface SlashCommand {
  data: AnySlashCommandData;
  execute(
    interaction: ChatInputCommandInteraction,
    ctx: BotContext,
  ): Promise<void>;
  autocomplete?(
    interaction: AutocompleteInteraction,
    ctx: BotContext,
  ): Promise<void>;
}
