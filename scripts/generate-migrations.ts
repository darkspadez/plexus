#!/usr/bin/env bun
import { $ } from 'bun';
import { parseArgs } from 'util';

const VALID_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

function showUsage() {
  console.error('Usage: bun run generate-migrations --name <descriptive-name>');
  console.error('');
  console.error('Examples:');
  console.error('  bun run generate-migrations --name add_user_preferences');
  console.error('  bun run generate-migrations --name fix_quota_timestamp_index');
  process.exit(1);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    name: { type: 'string' },
  },
  strict: false,
  allowPositionals: true,
});

if (!values.name) {
  console.error('Error: --name is required');
  showUsage();
}

const name = values.name;

if (!VALID_NAME_REGEX.test(name)) {
  console.error(`Error: Migration name "${name}" is invalid.`);
  console.error('Names must be snake_case: lowercase letters, numbers, and underscores only.');
  console.error('They must start with a letter.');
  process.exit(1);
}

console.log(`Generating SQLite migrations with name: ${name}`);
await $`cd packages/backend && bunx drizzle-kit generate --name ${name} --config drizzle.config.sqlite.ts`;

console.log(`Generating Postgres migrations with name: ${name}`);
await $`cd packages/backend && bunx drizzle-kit generate --name ${name} --config drizzle.config.postgres.ts`;

console.log('Done!');
