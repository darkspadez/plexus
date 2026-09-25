import fs from 'node:fs';
import path from 'node:path';
import { getSqliteDatabasePath } from '../../db/client';

export type LegacyFileKind = 'auth-json' | 'yaml-config';

export interface LegacyFile {
  /** Resolved absolute path (symlinks followed). */
  path: string;
  kind: LegacyFileKind;
  sizeBytes: number;
  modifiedAt: number;
  /** True when Plexus can delete the file itself. */
  purgeable: boolean;
  /** Why the file must be removed by hand (set when not purgeable). */
  blockedReason?: string;
}

export const BIND_MOUNTED_REASON = 'bind-mounted — remove it on the host';
export const READ_ONLY_REASON = 'read-only — remove it on the host';
export const YAML_CONFIG_REASON =
  'no longer read by Plexus — delete it on the host and drop its volume mount';

const MOUNTINFO_PATH = '/proc/self/mountinfo';

/** Where pre-database Plexus builds kept OAuth credentials (auth.json). */
function authJsonCandidates(): string[] {
  const candidates: string[] = [];
  const dbPath = getSqliteDatabasePath();
  if (dbPath) candidates.push(path.join(path.dirname(dbPath), 'auth.json'));
  if (process.env.DATA_DIR) candidates.push(path.join(process.env.DATA_DIR, 'auth.json'));
  candidates.push(path.join(process.cwd(), 'auth.json'));
  return candidates;
}

/** Where pre-database Plexus builds read their YAML configuration. */
function yamlConfigCandidates(): string[] {
  const candidates: string[] = [];
  if (process.env.CONFIG_FILE) candidates.push(process.env.CONFIG_FILE);
  candidates.push(path.join(process.cwd(), 'config', 'plexus.yaml'));
  return candidates;
}

/** Decode the octal escapes (`\040` for space, etc.) used in mountinfo paths. */
function decodeMountPath(raw: string): string {
  return raw.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  );
}

/**
 * Mount points of the current process (field 5 of /proc/self/mountinfo).
 * Empty on platforms without procfs (macOS, Windows).
 */
function readMountPoints(): Set<string> {
  const mounts = new Set<string>();
  let content: string;
  try {
    content = fs.readFileSync(MOUNTINFO_PATH, 'utf8');
  } catch {
    return mounts;
  }
  for (const line of content.split('\n')) {
    const mountPoint = line.split(' ')[4];
    if (mountPoint) mounts.add(decodeMountPath(mountPoint));
  }
  return mounts;
}

function isWritable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
    fs.accessSync(path.dirname(filePath), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function inspectFile(
  candidate: string,
  kind: LegacyFileKind,
  mountPoints: Set<string>
): LegacyFile | null {
  let resolved: string;
  let stat: fs.Stats;
  try {
    resolved = fs.realpathSync(path.resolve(candidate));
    stat = fs.statSync(resolved);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  let blockedReason: string | undefined;
  if (kind === 'yaml-config') blockedReason = YAML_CONFIG_REASON;
  else if (mountPoints.has(resolved)) blockedReason = BIND_MOUNTED_REASON;
  else if (!isWritable(resolved)) blockedReason = READ_ONLY_REASON;

  return {
    path: resolved,
    kind,
    sizeBytes: stat.size,
    modifiedAt: stat.mtimeMs,
    purgeable: blockedReason === undefined,
    ...(blockedReason ? { blockedReason } : {}),
  };
}

/**
 * Existing legacy files (auth.json credential stores and YAML config files),
 * deduplicated by resolved path. YAML files are always report-only: they are
 * usually volume-mounted and removing them is a deployment change.
 */
export function findLegacyFiles(): LegacyFile[] {
  const mountPoints = readMountPoints();
  const seen = new Set<string>();
  const files: LegacyFile[] = [];
  const candidates: Array<[string, LegacyFileKind]> = [
    ...authJsonCandidates().map((p): [string, LegacyFileKind] => [p, 'auth-json']),
    ...yamlConfigCandidates().map((p): [string, LegacyFileKind] => [p, 'yaml-config']),
  ];
  for (const [candidate, kind] of candidates) {
    const file = inspectFile(candidate, kind, mountPoints);
    if (!file || seen.has(file.path)) continue;
    seen.add(file.path);
    files.push(file);
  }
  return files;
}

/** Unlink purgeable files; failures are returned rather than thrown. */
export function deleteLegacyFiles(files: LegacyFile[]): {
  deleted: number;
  failures: string[];
} {
  let deleted = 0;
  const failures: string[] = [];
  for (const file of files) {
    if (!file.purgeable) continue;
    try {
      fs.unlinkSync(file.path);
      deleted++;
    } catch (error) {
      failures.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { deleted, failures };
}
