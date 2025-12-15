
import type { LogEntry, LogLevel } from '../types';

class LoggingService {
    private logs: LogEntry[] = [];
    private listeners: Set<() => void> = new Set();
    private MAX_LOGS = 1000;

    public log(level: LogLevel, message: string, data?: any) {
        if (this.logs.length >= this.MAX_LOGS) {
            this.logs.shift(); // Remove the oldest log
        }
        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
            // Deep clone data to prevent later mutations from affecting the log.
            // This is a simple approach; for complex objects with functions/symbols, a more robust cloning method would be needed.
            data: data ? JSON.parse(JSON.stringify(data)) : undefined 
        };
        this.logs.push(entry);

        // Also log to console for development convenience
        const consoleArgs = data ? [message, data] : [message];
        switch (level) {
            case 'INFO': console.info(`[${level}]`, ...consoleArgs); break;
            case 'DEBUG': console.debug(`[${level}]`, ...consoleArgs); break;
            case 'WARN': console.warn(`[${level}]`, ...consoleArgs); break;
            case 'ERROR': console.error(`[${level}]`, ...consoleArgs); break;
            default: console.log(`[${level}]`, ...consoleArgs);
        }

        this.notifyListeners();
    }

    public getLogs(): LogEntry[] {
        return this.logs;
    }

    public clearLogs() {
        this.logs = [];
        this.notifyListeners();
    }
    
    public addListener(callback: () => void) {
        this.listeners.add(callback);
    }

    public removeListener(callback: () => void) {
        this.listeners.delete(callback);
    }

    private notifyListeners() {
        this.listeners.forEach(callback => callback());
    }
}

export const loggingService = new LoggingService();
