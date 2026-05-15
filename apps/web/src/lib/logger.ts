type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'warn';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export const logger = {
  debug: (module: string, msg: string, ...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(`[${module}] ${msg}`, ...args);
  },
  info: (module: string, msg: string, ...args: unknown[]) => {
    if (shouldLog('info')) console.info(`[${module}] ${msg}`, ...args);
  },
  warn: (module: string, msg: string, ...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`[${module}] ${msg}`, ...args);
  },
  error: (module: string, msg: string, ...args: unknown[]) => {
    if (shouldLog('error')) console.error(`[${module}] ${msg}`, ...args);
  },
};
