import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import {
  formatDuration,
  formatScheduleDays,
  isValidTimezone,
  parseDurationMinutes,
  parseEveryNDays,
  parseLeadMinutes,
  parseScheduleDays,
  parseScheduleTimes,
  parseTimeOfDay,
  resolveRecentTimeInZone,
} from '../src/domain/duration.js';

describe('duration & time parsing', () => {
  it('parses diverse duration strings into minutes', () => {
    assert.equal(parseDurationMinutes('90'), 90);
    assert.equal(parseDurationMinutes('90m'), 90);
    assert.equal(parseDurationMinutes('2h'), 120);
    assert.equal(parseDurationMinutes('2j'), 120);
    assert.equal(parseDurationMinutes('1h 30m'), 90);
    assert.equal(parseDurationMinutes('1h30m'), 90);
    assert.equal(parseDurationMinutes('2j15m'), 135);
    assert.equal(parseDurationMinutes('1.5h'), 90);
    assert.equal(parseDurationMinutes('1d 2h'), 1560);
    assert.equal(parseDurationMinutes('0', false), null);
    assert.equal(parseDurationMinutes('0', true), 0);
    assert.equal(parseDurationMinutes('invalid'), null);
    assert.equal(parseDurationMinutes('10x'), null);
  });

  it('formats duration minutes readably', () => {
    assert.equal(formatDuration(0), '0m');
    assert.equal(formatDuration(45), '45m');
    assert.equal(formatDuration(120), '2h');
    assert.equal(formatDuration(150), '2h 30m');
    assert.equal(formatDuration(1500), '1d 1h');
  });

  it('parses time of day and schedule times', () => {
    assert.deepEqual(parseTimeOfDay('8:05'), {
      hour: 8,
      minute: 5,
      formatted: '08:05',
    });
    assert.deepEqual(parseTimeOfDay('20.30'), {
      hour: 20,
      minute: 30,
      formatted: '20:30',
    });
    assert.equal(parseTimeOfDay('25:00'), null);
    assert.deepEqual(parseScheduleTimes('20:00, 12:00 20:00'), ['12:00', '20:00']);
    assert.equal(parseScheduleTimes('12:00, invalid'), null);
  });

  it('parses schedule days in Indonesian and English', () => {
    assert.deepEqual(parseScheduleDays('daily'), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(parseScheduleDays('setiap hari'), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(parseScheduleDays('weekday'), [1, 2, 3, 4, 5]);
    assert.deepEqual(parseScheduleDays('weekend'), [0, 6]);
    assert.deepEqual(parseScheduleDays('sen, rab, jum'), [1, 3, 5]);
    assert.deepEqual(parseScheduleDays('mon,wed,sat'), [1, 3, 6]);
    assert.equal(parseScheduleDays('foo'), null);

    assert.equal(formatScheduleDays([0, 1, 2, 3, 4, 5, 6]), 'Setiap Hari');
    assert.equal(formatScheduleDays([1, 3, 5]), 'Sen, Rab, Jum');

    assert.equal(parseEveryNDays('every other day'), 2);
    assert.equal(parseEveryNDays('2 hari sekali'), 2);
    assert.equal(parseEveryNDays('every 3 days'), 3);
    assert.equal(parseEveryNDays('1 day'), null);
  });

  it('parses lead alert minutes', () => {
    assert.deepEqual(parseLeadMinutes('5, 15, 1, 5'), [15, 5, 1]);
    assert.deepEqual(parseLeadMinutes('none'), []);
    assert.equal(parseLeadMinutes('abc'), null);
  });

  it('resolves recent HH:mm in guild timezone with yesterday rollover', () => {
    // 2026-11-14 00:20:00 Asia/Jakarta
    const now = DateTime.fromObject(
      { year: 2026, month: 11, day: 14, hour: 0, minute: 20, second: 0 },
      { zone: 'Asia/Jakarta' },
    ).toMillis();

    // 00:10 -> same day (10 minutes ago)
    const sameDay = resolveRecentTimeInZone('00:10', 'Asia/Jakarta', now);
    assert.equal(sameDay, now - 10 * 60_000);

    // 23:50 -> yesterday (30 minutes ago)
    const yesterday = resolveRecentTimeInZone('23:50', 'Asia/Jakarta', now);
    assert.equal(yesterday, now - 30 * 60_000);

    assert.equal(isValidTimezone('Asia/Jakarta'), true);
    assert.equal(isValidTimezone('Invalid/Zone'), false);
  });
});
