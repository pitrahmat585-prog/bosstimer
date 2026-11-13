import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_COMMANDS } from '../src/discord/commands/index.js';

describe('Slash command definitions', () => {
  it('serializes all slash commands cleanly for Discord REST API', () => {
    assert.equal(ALL_COMMANDS.length, 6);
    const names = new Set<string>();
    for (const cmd of ALL_COMMANDS) {
      const json = cmd.data.toJSON();
      assert.ok(json.name.length >= 1 && json.name.length <= 32);
      assert.equal(names.has(json.name), false, `Duplicate command: ${json.name}`);
      names.add(json.name);
      assert.ok(json.description.length >= 1 && json.description.length <= 100);
    }
  });
});
