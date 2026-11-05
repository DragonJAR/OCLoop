import fs from 'node:fs';
import path from 'node:path';
import { renameWithRetrySync } from './atomic-fs';

const LOG_FILE = '.loop.log';
const OLD_LOG_FILE = '.loop.log.old';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'HEALTH';

/**
 * Structured metrics attached to a health-log entry. Kept open-ended so the
 * watchdog / sleep-detector can record whatever is useful for an audit
 * (heartbeat age, session status, probe results, attempt counters, ...).
 */
export type HealthMetrics = Record<string, unknown>;

export function formatLogEntry(
  timestamp: string,
  level: LogLevel,
  context: string,
  message: string,
  data?: unknown,
): string {
  let line = `[${timestamp}] [${level}] [${context}] ${message}`;

  if (data !== undefined) {
    try {
      if (data instanceof Error) {
        line += ` ${JSON.stringify({ name: data.name, message: data.message, stack: data.stack })}`;
      } else {
        line += ` ${JSON.stringify(data)}`;
      }
    } catch {
      line += ` [Circular or Non-Serializable Data]`;
    }
  }

  return line;
}

/**
 * Rotate `logFile` to `oldLogPath`, best-effort. Goes through atomic-fs's
 * renameWithRetrySync so a transient Windows lock (antivirus, indexer, a
 * second handle: EPERM/EBUSY/EACCES) is retried instead of losing the
 * rotation. A persistent failure is swallowed: the caller then overwrites the
 * current log, which is the intended fallback (logging must never crash).
 * Returns whether the rotation happened. `op`/`platform` are test seams.
 */
export function rotateLogFile(
  logFile: string,
  oldLogPath: string,
  op?: (from: string, to: string) => void,
  platform: string = process.platform,
): boolean {
  try {
    renameWithRetrySync(logFile, oldLogPath, op, platform);
    return true;
  } catch {
    return false;
  }
}

class DebugLogger {
  private logFile: string;
  private enabled: boolean = true;

  constructor() {
    this.logFile = path.resolve(process.cwd(), LOG_FILE);
  }

  sessionStart(opts: { debug: boolean; cwd: string; model?: string }) {
    // Rotate logs
    if (fs.existsSync(this.logFile)) {
      rotateLogFile(this.logFile, path.resolve(process.cwd(), OLD_LOG_FILE));
    }

    // Start fresh log file
    const header = [
      '================================================================================',
      `OCLOOP SESSION: ${new Date().toISOString()}`,
      `Working Directory: ${opts.cwd}`,
      `Debug Mode: ${opts.debug}`,
      `Model: ${opts.model || 'default'}`,
      '================================================================================',
      ''
    ].join('\n');

    try {
      fs.writeFileSync(this.logFile, header);
    } catch (err) {
      console.error('Failed to initialize debug log:', err);
      this.enabled = false;
    }
  }

  iterationStart(n: number) {
    this.writeRaw(`--- ITERATION ${n} ---\n`);
  }

  iterationEnd(n: number) {
    this.writeRaw(`--- ITERATION ${n} END ---\n`);
  }

  debug(context: string, message: string, data?: unknown) {
    this.entry('DEBUG', context, message, data);
  }

  info(context: string, message: string, data?: unknown) {
    this.entry('INFO', context, message, data);
  }

  warn(context: string, message: string, data?: unknown) {
    this.entry('WARN', context, message, data);
  }

  error(context: string, message: string, error?: unknown) {
    this.entry('ERROR', context, message, error);
  }

  /**
   * Structured health/watchdog telemetry.
   *
   * Emits a single greppable line — `[HEALTH] [component] state {metrics}` — so
   * that after an incident you can `grep HEALTH .loop.log` to replay exactly why
   * the guardian suspected, confirmed, recovered, or stood down. `state` is the
   * transition or condition (e.g. "heartbeat", "suspect", "confirming",
   * "recovering", "recovered"); `metrics` is structured JSON.
   */
  health(component: string, state: string, metrics?: HealthMetrics) {
    this.entry('HEALTH', component, state, metrics);
  }

  private entry(level: LogLevel, context: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.mmm
    const line = formatLogEntry(timestamp, level, context, message, data);
    this.writeRaw(line + '\n');
  }

  private writeRaw(content: string) {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(this.logFile, content);
    } catch {
      // If we can't write to the log, suppress the error: logging is
      // best-effort and must never crash the app.
    }
  }
}

export const log = new DebugLogger();
