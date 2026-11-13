import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('enables autoDeployCommands automatically on Railway and honors explicit override', () => {
    const prev = {
      DISCORD_TOKEN: process.env.DISCORD_TOKEN,
      DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      AUTO_DEPLOY_COMMANDS: process.env.AUTO_DEPLOY_COMMANDS,
    };

    try {
      process.env.DISCORD_TOKEN = 'test-token';
      process.env.DISCORD_CLIENT_ID = 'test-client';
      delete process.env.RAILWAY_ENVIRONMENT;
      delete process.env.AUTO_DEPLOY_COMMANDS;

      assert.equal(loadEnv().autoDeployCommands, false);

      process.env.RAILWAY_ENVIRONMENT = 'production';
      assert.equal(loadEnv().autoDeployCommands, true);

      process.env.AUTO_DEPLOY_COMMANDS = 'false';
      assert.equal(loadEnv().autoDeployCommands, false);

      delete process.env.RAILWAY_ENVIRONMENT;
      process.env.AUTO_DEPLOY_COMMANDS = 'true';
      assert.equal(loadEnv().autoDeployCommands, true);
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
    }
  });
});
