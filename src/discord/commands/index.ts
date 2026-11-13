import { SlashCommand } from '../types.js';
import { boardCommand } from './board.js';
import { bossCommand } from './boss.js';
import { bossesCommand } from './bosses.js';
import { configCommand } from './config.js';
import { killCommand } from './kill.js';
import { timerCommand } from './timer.js';

export const ALL_COMMANDS: SlashCommand[] = [
  bossesCommand,
  killCommand,
  timerCommand,
  bossCommand,
  boardCommand,
  configCommand,
];
