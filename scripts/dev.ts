import { join, basename } from 'path';
import { tmpdir } from 'os';
import { createServer } from 'net';
import { existsSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { spawn as nodeSpawn, type ChildProcess } from 'child_process';
import { deriveDevPort } from './dev-port-allocator';

// --- Dev defaults (only applied when not already set in environment) ---

const dirName = basename(process.cwd());

// Marker file written by packages/backend/scripts/seed-dev.ts after a successful seed. Its
// presence (not the database contents) gates whether we start the mock upstream + ticker below,
// so pointing DATABASE_URL at a restored/real database never triggers synthetic traffic against it.
const MARKER_FILE = join(tmpdir(), `plexus-${dirName}.seeded`);

function readOptionValue(args: string[], index: number, option: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Missing value for ${option}`);
    process.exit(1);
  }
  return value;
}

let fullMode = false;
let profileMode = false;
let noOpen = false;

function sqlitePathFromDatabaseUrl(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith('sqlite://')) return null;
  return databaseUrl.slice('sqlite://'.length);
}

// Mode-independent freshness check: true when there is no existing local database file / PGlite
// data dir for the currently-resolved DATABASE_URL. Drives both the full-mode prep-dev restore
// decision (as before) and the auto-seed-on-first-boot decision (new).
function isFreshDb(): boolean {
  if (process.env.PLEXUS_POSTGRES_DRIVER === 'pglite') {
    return process.env.PLEXUS_PGLITE_DATA_DIR
      ? !existsSync(process.env.PLEXUS_PGLITE_DATA_DIR)
      : true;
  }

  const dbPath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL!);
  return dbPath ? !existsSync(dbPath) : false;
}

// PLEXUS_SEED=fresh: wipe the worktree-local database (+ marker) before treating this boot as
// fresh. Only ever deletes these derived, per-worktree paths — refuses (loudly) to touch a real
// Postgres server, since we have no safe way to wipe/restore one.
function wipeForFreshSeed(): void {
  const isPglite = process.env.PLEXUS_POSTGRES_DRIVER === 'pglite';
  const isSqlite = process.env.DATABASE_URL!.startsWith('sqlite://');

  if (!isPglite && !isSqlite) {
    console.error(
      `PLEXUS_SEED=fresh refuses to wipe DATABASE_URL=${process.env.DATABASE_URL} — it does not ` +
        'look like a worktree-local sqlite or pglite dev database and may be a real Postgres ' +
        'server. Unset PLEXUS_SEED or point DATABASE_URL at a local dev database.'
    );
    process.exit(1);
  }

  if (isPglite) {
    const dir = process.env.PLEXUS_PGLITE_DATA_DIR;
    if (!dir) {
      // Reachable when PLEXUS_POSTGRES_DRIVER=pglite but DATABASE_URL was user-set, which skips
      // the defaulting block that would have derived the data dir. Refuse rather than guess.
      console.error(
        'PLEXUS_SEED=fresh cannot resolve the PGlite data dir: PLEXUS_POSTGRES_DRIVER=pglite is ' +
          'set but PLEXUS_PGLITE_DATA_DIR is not (a custom DATABASE_URL skips its default). Set ' +
          'PLEXUS_PGLITE_DATA_DIR explicitly or unset PLEXUS_SEED.'
      );
      process.exit(1);
    }
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`[dev] PLEXUS_SEED=fresh: deleted PGlite data dir ${dir}`);
    }
  } else {
    const dbPath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL!)!;
    for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(candidate)) {
        unlinkSync(candidate);
        console.log(`[dev] PLEXUS_SEED=fresh: deleted ${candidate}`);
      }
    }
  }

  if (existsSync(MARKER_FILE)) {
    unlinkSync(MARKER_FILE);
    console.log(`[dev] PLEXUS_SEED=fresh: deleted marker file ${MARKER_FILE}`);
  }
}

// Non-throwing bind probe. With no host, listen() binds IPv6-any ([::]) — which on macOS does
// NOT conflict with a process bound IPv4-only (the backend binds 0.0.0.0), so callers must
// check both families via isPortInUseAnyFamily() to reliably detect a running instance.
function isPortInUse(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    if (host) {
      probe.listen(port, host);
    } else {
      probe.listen(port);
    }
  });
}

async function isPortInUseAnyFamily(port: number): Promise<boolean> {
  return (await isPortInUse(port)) || (await isPortInUse(port, '0.0.0.0'));
}

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];

  if (arg === '--profile') {
    profileMode = true;
  } else if (arg === '--pglite') {
    process.env.PLEXUS_POSTGRES_DRIVER = 'pglite';
  } else if (arg === '--full') {
    fullMode = true;
  } else if (arg === '--no-open') {
    noOpen = true;
  } else if (arg.startsWith('DATABASE_URL=')) {
    process.env.DATABASE_URL = arg.slice('DATABASE_URL='.length);
  } else if (arg.startsWith('PORT=')) {
    process.env.PORT = arg.slice('PORT='.length);
  } else if (arg.startsWith('ADMIN_KEY=')) {
    process.env.ADMIN_KEY = arg.slice('ADMIN_KEY='.length);
  } else if (arg === '--database-url') {
    process.env.DATABASE_URL = readOptionValue(process.argv, i, arg);
    i++;
  } else if (arg.startsWith('--database-url=')) {
    process.env.DATABASE_URL = arg.slice('--database-url='.length);
  } else if (arg === '--port') {
    process.env.PORT = readOptionValue(process.argv, i, arg);
    i++;
  } else if (arg.startsWith('--port=')) {
    process.env.PORT = arg.slice('--port='.length);
  } else if (arg === '--admin-key') {
    process.env.ADMIN_KEY = readOptionValue(process.argv, i, arg);
    i++;
  } else if (arg.startsWith('--admin-key=')) {
    process.env.ADMIN_KEY = arg.slice('--admin-key='.length);
  } else {
    console.error(`Unknown option: ${arg}`);
    console.error('Usage: bun run dev [DATABASE_URL=...] [PORT=...] [ADMIN_KEY=...]');
    console.error(
      '   or: bun run dev [--database-url ...] [--port ...] [--admin-key ...] [--pglite] [--full] [--no-open] [--profile]'
    );
    process.exit(1);
  }
}

// Stable port derived from the worktree directory name, range 10000-19999.
// Two worktrees running simultaneously will land on different ports automatically.
// Override with: PORT=4000 bun run dev
if (!process.env.PORT) {
  process.env.PORT = deriveDevPort();
}

// Per-worktree database — persists across restarts, isolated per branch.
// PGlite mode: bun run dev --pglite  (or PLEXUS_POSTGRES_DRIVER=pglite)
// Postgres mode: DATABASE_URL=postgresql://... bun run dev
if (!process.env.DATABASE_URL) {
  if (process.env.PLEXUS_POSTGRES_DRIVER === 'pglite') {
    if (!process.env.PLEXUS_PGLITE_DATA_DIR) {
      process.env.PLEXUS_PGLITE_DATA_DIR = join(tmpdir(), `plexus-${dirName}.pglite`);
    }
    // Placeholder URL — dialect detection requires postgres://, actual storage is PLEXUS_PGLITE_DATA_DIR
    process.env.DATABASE_URL = 'postgres://localhost/plexus';
  } else {
    process.env.DATABASE_URL = `sqlite://${join(tmpdir(), `plexus-${dirName}.db`)}`;
  }
}

// Mirrors scripts/live-ticker.ts's own PLEXUS_PORT derivation (same DJB2 hash) so it agrees on
// the target port even when PORT was overridden/derived differently than its own fallback would.
if (!process.env.PLEXUS_PORT) {
  process.env.PLEXUS_PORT = process.env.PORT;
}

// Mock upstream port — same DJB2 hash + 20000-29999 range as scripts/mock-upstream.ts and
// packages/backend/scripts/seed-dev.ts's own derivations, computed once here and exported so the
// seeder, the mock upstream child, and the seeded provider configs all agree on one value.
if (!process.env.PLEXUS_MOCK_PORT) {
  let mockHash = 5381;
  for (let i = 0; i < dirName.length; i++) {
    mockHash = (mockHash * 33) ^ dirName.charCodeAt(i);
  }
  process.env.PLEXUS_MOCK_PORT = String(20000 + (Math.abs(mockHash) % 10000));
}

// --- PLEXUS_SEED flag: 0/off disables the synthetic seeder; fresh wipes local data first ---
// (the prep-dev backup-restore path and the marker-gated mock upstream/ticker spawning further
// down are both independent of this flag).

const SEED_FLAG = (process.env.PLEXUS_SEED ?? '').trim().toLowerCase();
const seedingEnabled = SEED_FLAG !== '0' && SEED_FLAG !== 'off';
const forceFreshSeed = SEED_FLAG === 'fresh';

// Dev-only admin key.
// Override with: ADMIN_KEY=secret bun run dev
if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'password';
}

// --- Port availability check ---
// Runs BEFORE the PLEXUS_SEED=fresh wipe below: if this worktree's stack is already running,
// its backend holds these sqlite files open, and deleting them out from under a live connection
// risks corruption — and the boot would only die on this probe afterwards anyway. Checks both
// address families: an IPv6-any probe alone succeeds on macOS while the backend holds the same
// port IPv4-only, which would let the wipe proceed under a live stack.

if (await isPortInUseAnyFamily(parseInt(process.env.PORT!))) {
  console.error(
    `Port ${process.env.PORT} is already in use. Is another worktree running? Override with: PORT=<number> bun run dev`
  );
  process.exit(1);
}

// --- PLEXUS_SEED=fresh wipe + seed/restore decision (computed once, before any spawns) ---

if (forceFreshSeed) {
  wipeForFreshSeed();
}

const isFresh = isFreshDb();

// A "backup source" is real (staging or previously-saved) data prep-dev can restore. When one
// exists and we're in full mode on a fresh DB, restoring it wins over the synthetic seeder —
// independently of PLEXUS_SEED, which gates only the seeder. The saved-backup path mirrors
// prep-dev.ts's own PLEXUS_DEV_DATA_PATH resolution.
const backupSource =
  Boolean(process.env.PLEXUS_STAGING_URL && process.env.PLEXUS_STAGING_ADMIN_KEY) ||
  existsSync(join(process.env.PLEXUS_DEV_DATA_PATH ?? '.dev-data', 'backup.tar.gz'));
const restoreWinsThisBoot = isFresh && fullMode && backupSource;
const willSeedPreBoot = seedingEnabled && isFresh && !restoreWinsThisBoot;

function describeSeedStatus(): string {
  if (restoreWinsThisBoot) return 'restoring from backup source';
  if (!seedingEnabled) return 'seeding disabled';
  if (!isFresh) {
    return existsSync(MARKER_FILE) ? 'seeded DB (marker present)' : 'no seed marker (not seeded)';
  }
  return 'seeding fresh DB…';
}

// --- PID file ---
// Written so that prep-dev.ts (--clear/--reset) can send SIGUSR1 to trigger a backend restart.

const PID_FILE = join(tmpdir(), `plexus-${dirName}.pid`);
writeFileSync(PID_FILE, String(process.pid));

// --- Startup ---

const BACKEND_DIR = join(process.cwd(), 'packages/backend');
const FRONTEND_DIR = join(process.cwd(), 'packages/frontend');

console.log('Starting Plexus Dev Stack...');
console.log(`  PORT:         ${process.env.PORT}`);
if (process.env.PLEXUS_POSTGRES_DRIVER === 'pglite') {
  console.log(`  DB Driver:    PGlite`);
  console.log(`  DB Data Dir:  ${process.env.PLEXUS_PGLITE_DATA_DIR}`);
} else {
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL}`);
}
console.log(`  ADMIN_KEY:    ${process.env.ADMIN_KEY}`);
console.log(`  Seed status:  ${describeSeedStatus()}`);

// --- Profile mode: CPU profiling without watcher ---

if (profileMode) {
  const profDir = join(process.cwd(), '.prof');
  console.log('\n--- PROFILE MODE: CPU profiling enabled ---');
  console.log(`Profiles will be written to: ${profDir}`);
  console.log('  - CPU profiling (100μs interval for higher precision)');
  console.log('Press Ctrl+C to stop profiling.\n');

  await new Promise<void>((resolve, reject) => {
    const proc = nodeSpawn(
      'bun',
      [
        'run',
        '--cpu-prof',
        '--cpu-prof-md',
        '--cpu-prof-interval=100',
        '--cpu-prof-dir',
        profDir,
        'src/index.ts',
      ],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env },
        stdio: 'inherit',
      }
    );
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Backend exited with code ${code}`));
    });
    proc.on('error', reject);
  }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
  process.exit(0);
}

// --- Process management ---
//
// Bun's --watch processes trap SIGINT and *restart* instead of exiting.
// So on shutdown we must SIGKILL them to force-terminate. Otherwise they
// become orphaned and accumulate, eventually exhausting memory.
//
// Each child is spawned in its own process group (detached: true / setsid)
// so that process.kill(-pgid) kills the entire subtree including
// grandchildren spawned by --watch restarts.
//
// Note: terminal close (SIGHUP) is not reliably delivered to this process
// because Bun may not propagate it. If you close your terminal without
// Ctrl+C, run: pkill -f "bun run" to clean up.

const WIN = process.platform === 'win32';

const childPgids: number[] = [];
let isShuttingDown = false;

function spawnManaged(args: string[], cwd: string): ChildProcess {
  const proc = nodeSpawn('bun', args, {
    cwd,
    env: { ...process.env },
    stdio: 'inherit',
    detached: true, // own process group → can kill -pgid
    ...(WIN ? { shell: true } : {}),
  });
  // Don't unref() — we need the child handles to keep the event loop alive.
  // Without them, Bun sees no pending work and exits immediately.
  childPgids.push(proc.pid!);
  return proc;
}

function killAll() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  for (const pgid of childPgids) {
    try {
      if (WIN) {
        process.kill(pgid);
      } else {
        process.kill(-pgid, 'SIGKILL');
      }
    } catch {
      // already dead
    }
  }

  try {
    unlinkSync(PID_FILE);
  } catch {}
}

function spawnBackend(): ChildProcess {
  return spawnManaged(['run', '--watch', '--no-clear-screen', 'src/index.ts'], BACKEND_DIR);
}

// --- Seed a fresh DB before the backend boots (unless disabled, or a backup source wins) ---

if (willSeedPreBoot) {
  console.log(
    '\n[dev] Fresh database detected — seeding via packages/backend/scripts/seed-dev.ts...\n'
  );
  await new Promise<void>((resolve) => {
    const proc = nodeSpawn('bun', ['run', 'scripts/seed-dev.ts'], {
      cwd: BACKEND_DIR,
      env: { ...process.env },
      stdio: 'inherit',
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(
          `[dev] SEEDER FAILED (exit code ${code}) — continuing boot with an unseeded/partially-seeded database.`
        );
      }
      resolve();
    });
    proc.on('error', (err) => {
      console.error(
        `[dev] Failed to launch seeder: ${err instanceof Error ? err.message : err}. Continuing boot.`
      );
      resolve();
    });
  });
} else if (restoreWinsThisBoot) {
  console.log(
    '[dev] Fresh database with a backup source available — restoring via prep-dev after boot.\n'
  );
  // A leftover marker from a previously-seeded (since deleted) DB must not survive into a
  // restore boot — it would spawn the mock upstream + ticker and fire synthetic traffic at the
  // restored real data. Deleting it keeps the marker's meaning strict: "this DB was seeded".
  if (existsSync(MARKER_FILE)) {
    unlinkSync(MARKER_FILE);
    console.log(`[dev] Deleted stale seed marker ${MARKER_FILE} (restoring real data instead).`);
  }
}

// Captured once, right after the seed/restore decision above: reflects whether this boot has a
// seed-dev.ts-seeded database to work with. Used both for the mock upstream (below) and the
// ticker (post-health, further down) so they agree on the same snapshot.
const markerPresent = existsSync(MARKER_FILE);

// --- Mock upstream: managed child, started before the backend so its quota-scheduler ---
// --- boot-time checks succeed against reachable (seeded) providers. ---

if (markerPresent) {
  const mockPort = parseInt(process.env.PLEXUS_MOCK_PORT!, 10);
  if (await isPortInUseAnyFamily(mockPort)) {
    console.log(
      `[dev] Mock upstream port ${mockPort} is already in use — assuming an existing instance, not spawning a new one.`
    );
  } else {
    console.log(`[dev] Starting mock upstream on port ${mockPort}...`);
    spawnManaged(['run', 'scripts/mock-upstream.ts'], process.cwd());
  }
}

let backend = spawnBackend();

console.log('[Frontend] Starting builder (watch mode)...');
const frontend = spawnManaged(['run', 'dev'], FRONTEND_DIR);

console.log(`Backend: http://localhost:${process.env.PORT}`);
console.log('Watching for changes...');

// --- Auto-open browser (unless --no-open) ---

function openBrowser(url: string) {
  try {
    if (process.platform === 'win32') {
      nodeSpawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const child = nodeSpawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', () => {});
      child.unref();
    }
  } catch {
    // Silently ignore if browser opener is not available
  }
}

if (!noOpen) {
  (async () => {
    console.log(`\n[dev] Waiting for server at http://localhost:${process.env.PORT}...`);
    try {
      await waitForServer();
      const url = `http://localhost:${process.env.PORT}/ui/login?token=${encodeURIComponent(process.env.ADMIN_KEY!)}`;
      console.log(`[dev] Server ready. Opening browser: ${url}`);
      openBrowser(url);
    } catch (err) {
      console.error(`[dev] ${err instanceof Error ? err.message : err}. Not opening browser.`);
    }
  })();
}

// --- Full mode: wait for server ready, then run prep-dev ---

async function waitForServer(timeout = 30000): Promise<void> {
  const url = `http://localhost:${process.env.PORT}`;
  const start = Date.now();
  let consecutiveOk = 0;
  const requiredOk = 5;
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        consecutiveOk++;
        if (consecutiveOk >= requiredOk) return;
      } else {
        consecutiveOk = 0;
      }
    } catch {
      consecutiveOk = 0;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready within ${timeout / 1000}s`);
}

if (fullMode) {
  (async () => {
    if (!restoreWinsThisBoot) {
      if (!isFresh) {
        console.log('[full] Existing dev database found. Skipping prep-dev restore.');
      } else if (willSeedPreBoot) {
        console.log(
          '[full] Fresh database seeded by scripts/seed-dev.ts (no backup source configured). Skipping prep-dev restore.'
        );
      } else {
        console.log('[full] PLEXUS_SEED disabled and no backup source — database left empty.');
      }
      return;
    }

    console.log(`\n[full] Waiting for server at http://localhost:${process.env.PORT}...`);
    try {
      await waitForServer();
      console.log('[full] Server ready. Loading dev data...\n');
    } catch (err) {
      console.error(`[full] ${err instanceof Error ? err.message : err}. Skipping prep-dev.`);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const proc = nodeSpawn('bun', ['run', 'prep-dev'], {
        cwd: process.cwd(),
        env: { ...process.env },
        stdio: 'inherit',
      });
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`prep-dev exited with code ${code}`))
      );
      proc.on('error', reject);
    }).catch((err) => console.error(`[full] ${err instanceof Error ? err.message : err}`));

    // prep-dev triggers a server restart after restore, so wait for it to come back up
    console.log('[full] Waiting for server to restart after restore...');
    try {
      await waitForServer();
      console.log('[full] Server restarted and ready.\n');
      if (!noOpen) {
        const url = `http://localhost:${process.env.PORT}/ui/login?token=${encodeURIComponent(process.env.ADMIN_KEY!)}`;
        console.log(`[full] Opening browser: ${url}`);
        openBrowser(url);
      }
    } catch (err) {
      console.error(`[full] ${err instanceof Error ? err.message : err}.`);
    }
  })();
}

// --- Live ticker: post-health, always runs (independent of --full/--no-open) ---

(async () => {
  if (!markerPresent) return;

  console.log(
    `\n[dev] Waiting for server at http://localhost:${process.env.PORT} to start the live ticker...`
  );
  try {
    await waitForServer();
  } catch (err) {
    console.error(
      `[dev] ${err instanceof Error ? err.message : err}. Not starting the live ticker.`
    );
    return;
  }

  console.log('[dev] Server ready. Starting live ticker...');
  spawnManaged(['run', 'scripts/live-ticker.ts'], process.cwd());
})();

// Keep the event loop alive. The child handles already do this, but
// the interval acts as a safety net in case Bun optimises them away.
const keepalive = setInterval(() => {}, 60000);
keepalive.unref();

// --- Signal handling ---

process.on('SIGINT', () => {
  console.log('\nStopping...');
  killAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nStopping (SIGTERM)...');
  killAll();
  process.exit(0);
});

process.on('SIGHUP', () => {
  console.log('\nStopping (SIGHUP)...');
  killAll();
  process.exit(0);
});

// SIGUSR1 — kill and respawn the backend (used by prep-dev.ts --clear/--reset after DB wipe).
// We use SIGUSR1 instead of SIGHUP because SIGHUP is the standard signal
// for "your controlling terminal went away" and should trigger shutdown.
process.on('SIGUSR1', () => {
  if (isShuttingDown) return;
  console.log('\n[dev] SIGUSR1 received — restarting backend...');
  try {
    process.kill(-backend.pid!, 'SIGKILL');
  } catch {
    // already dead
  }
  const idx = childPgids.indexOf(backend.pid!);
  if (idx >= 0) childPgids.splice(idx, 1);
  backend = spawnBackend();
  console.log('[dev] Backend restarted.');
});

// Synchronous fallback — runs even if the signal handler doesn't complete.
process.on('exit', killAll);
