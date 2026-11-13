import { DateTime } from 'luxon';
import { parseTimeOfDay } from '../domain/duration.js';
import { BossExportEntry } from '../domain/types.js';

export type PresetPackId =
  | 'architect_g1_single'
  | 'architect_g1_all'
  | 'architect_world_boss'
  | 'architect_tower'
  | 'architect_all'
  | 'starter';

// Architect Global (UTC+7 / WIB in-game clock):
// Field Boss Group I spawn times: 08:15, 11:15, 20:15, 23:15 WIB
const ARCHITECT_G1_WIB_TIMES = ['08:15', '11:15', '20:15', '23:15'];
const ARCHITECT_SOURCE_ZONE = 'Asia/Jakarta'; // UTC+7 (no DST)

export function convertScheduleTimesFromZone(
  times: string[],
  sourceZone: string,
  targetZone: string,
): string[] {
  const validTarget = DateTime.now().setZone(targetZone).isValid
    ? targetZone
    : 'Asia/Jakarta';

  const converted = new Set<string>();
  const refDate = DateTime.fromObject(
    { year: 2026, month: 1, day: 15 },
    { zone: sourceZone },
  );

  for (const t of times) {
    const parsed = parseTimeOfDay(t);
    if (!parsed) continue;
    const dt = refDate.set({ hour: parsed.hour, minute: parsed.minute });
    converted.add(dt.setZone(validTarget).toFormat('HH:mm'));
  }

  return Array.from(converted).sort();
}

export function buildArchitectPresets(
  targetTimezone: string,
  pack:
    | 'architect_g1_single'
    | 'architect_g1_all'
    | 'architect_world_boss'
    | 'architect_tower'
    | 'architect_all',
): BossExportEntry[] {
  const dailyDays = [0, 1, 2, 3, 4, 5, 6];
  const g1Times = convertScheduleTimesFromZone(
    ARCHITECT_G1_WIB_TIMES,
    ARCHITECT_SOURCE_ZONE,
    targetTimezone,
  );
  const evening20 = convertScheduleTimesFromZone(
    ['20:00'],
    ARCHITECT_SOURCE_ZONE,
    targetTimezone,
  );

  const g1Single: BossExportEntry = {
    name: 'Field Boss Group I',
    mode: 'schedule',
    category: 'Field Boss • Group I',
    location: 'Karugura • Tagar • Gigas',
    respawnMinutes: null,
    respawnMaxMinutes: null,
    scheduleDays: dailyDays,
    scheduleTimes: g1Times,
    leadMinutes: [15, 5, 1],
    mentionTarget: null,
    enabled: true,
    notes: 'Jadwal spawn harian 08:15, 11:15, 20:15, 23:15 WIB. Otomatis lanjut ke siklus berikutnya.',
  };

  const g1Individual: BossExportEntry[] = [
    {
      name: 'Black Reaper Karugura',
      mode: 'schedule',
      category: 'Field Boss • Group I',
      location: 'Scything Barrens • Gorge of Perdition',
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: dailyDays,
      scheduleTimes: g1Times,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'Field Boss Group I — 08:15, 11:15, 20:15, 23:15 WIB.',
    },
    {
      name: 'Red Mane Tagar',
      mode: 'schedule',
      category: 'Field Boss • Group I',
      location: "Giant's Garden • Kuduru's Domain",
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: dailyDays,
      scheduleTimes: g1Times,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'Field Boss Group I — 08:15, 11:15, 20:15, 23:15 WIB.',
    },
    {
      name: 'Infected Beast King Gigas',
      mode: 'schedule',
      category: 'Field Boss • Group I',
      location: 'Pulsing Ridge • Ember-Choke Grove',
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: dailyDays,
      scheduleTimes: g1Times,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'Field Boss Group I — 08:15, 11:15, 20:15, 23:15 WIB.',
    },
  ];

  const worldBosses: BossExportEntry[] = [
    {
      name: 'Agarash',
      mode: 'schedule',
      category: 'World Boss',
      location: 'Pulsing Ridge',
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: dailyDays,
      scheduleTimes: evening20,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'World Boss harian pukul 20:00 WIB.',
    },
    {
      name: 'Shahgar',
      mode: 'schedule',
      category: 'World Boss',
      location: "Giant's Garden",
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: dailyDays,
      scheduleTimes: evening20,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'World Boss harian pukul 20:00 WIB.',
    },
    {
      name: 'Ancient Monster Behemoth',
      mode: 'schedule',
      category: 'World Boss',
      location: 'Scything Barrens',
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: null,
      scheduleTimes: evening20,
      scheduleIntervalDays: 2,
      scheduleAnchorDate: '2026-11-15',
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'World Boss setiap 2 hari sekali (Every other day) pukul 20:00 WIB.',
    },
  ];

  const towerBosses: BossExportEntry[] = [
    {
      name: 'Gishkal the Lava Fist',
      mode: 'schedule',
      category: "Giant's Tower Boss",
      location: "Giant's Tower 1F",
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: [1, 4], // Mon, Thu
      scheduleTimes: evening20,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'Setiap Senin & Kamis pukul 20:00 WIB.',
    },
    {
      name: 'Halpasiam the Frozer',
      mode: 'schedule',
      category: "Giant's Tower Boss",
      location: "Giant's Tower 2F",
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: [2, 5], // Tue, Fri
      scheduleTimes: evening20,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'Setiap Selasa & Jumat pukul 20:00 WIB.',
    },
    {
      name: 'Drugamu',
      mode: 'schedule',
      category: "Giant's Tower Boss",
      location: "Giant's Tower 3F",
      respawnMinutes: null,
      respawnMaxMinutes: null,
      scheduleDays: [3, 6], // Wed, Sat
      scheduleTimes: evening20,
      leadMinutes: [15, 5, 1],
      mentionTarget: null,
      enabled: true,
      notes: 'Setiap Rabu & Sabtu pukul 20:00 WIB.',
    },
  ];

  switch (pack) {
    case 'architect_g1_single':
      return [g1Single];
    case 'architect_g1_all':
      return g1Individual;
    case 'architect_world_boss':
      return worldBosses;
    case 'architect_tower':
      return towerBosses;
    case 'architect_all':
      return [g1Single, ...worldBosses, ...towerBosses];
  }
}

export const STARTER_BOSS_PRESETS: BossExportEntry[] = [
  {
    name: 'Crimson Dragon',
    mode: 'cooldown',
    category: 'World Boss',
    location: 'Volcano Crater Ch.1',
    respawnMinutes: 120,
    respawnMaxMinutes: 150,
    scheduleDays: null,
    scheduleTimes: null,
    leadMinutes: [15, 5, 1],
    mentionTarget: null,
    enabled: true,
    notes: 'Random spawn window 2h - 2h 30m setelah mati',
  },
  {
    name: 'Abyssal Titan',
    mode: 'cooldown',
    category: 'Field Boss',
    location: 'Sunken Ruins',
    respawnMinutes: 60,
    respawnMaxMinutes: null,
    scheduleDays: null,
    scheduleTimes: null,
    leadMinutes: [10, 3],
    mentionTarget: null,
    enabled: true,
    notes: 'Respawn pasti 1 jam setelah kill',
  },
  {
    name: 'Shadow Monarch',
    mode: 'schedule',
    category: 'World Boss',
    location: 'Citadel Center',
    respawnMinutes: null,
    respawnMaxMinutes: null,
    scheduleDays: [0, 1, 2, 3, 4, 5, 6],
    scheduleTimes: ['12:00', '20:00'],
    leadMinutes: [15, 5, 1],
    mentionTarget: null,
    enabled: true,
    notes: 'Spawn harian jam 12:00 & 20:00',
  },
  {
    name: 'Ancient Guardian',
    mode: 'schedule',
    category: 'Guild Raid',
    location: 'Sanctum Arena',
    respawnMinutes: null,
    respawnMaxMinutes: null,
    scheduleDays: [3, 6],
    scheduleTimes: ['21:00'],
    leadMinutes: [30, 10, 5],
    mentionTarget: null,
    enabled: true,
    notes: 'Boss mingguan setiap Rabu & Sabtu',
  },
];

export const COMMON_TIMEZONES: Array<{ label: string; value: string }> = [
  { label: 'WIB - Asia/Jakarta (UTC+7)', value: 'Asia/Jakarta' },
  { label: 'WITA - Asia/Makassar (UTC+8)', value: 'Asia/Makassar' },
  { label: 'WIT - Asia/Jayapura (UTC+9)', value: 'Asia/Jayapura' },
  { label: 'SGT - Asia/Singapore (UTC+8)', value: 'Asia/Singapore' },
  { label: 'MYT - Asia/Kuala_Lumpur (UTC+8)', value: 'Asia/Kuala_Lumpur' },
  { label: 'JST - Asia/Tokyo (UTC+9)', value: 'Asia/Tokyo' },
  { label: 'KST - Asia/Seoul (UTC+9)', value: 'Asia/Seoul' },
  { label: 'UTC (Coordinated Universal Time)', value: 'UTC' },
  { label: 'EST/EDT - America/New_York', value: 'America/New_York' },
  { label: 'PST/PDT - America/Los_Angeles', value: 'America/Los_Angeles' },
  { label: 'GMT/BST - Europe/London', value: 'Europe/London' },
];
