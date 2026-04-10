import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';
import { ActivityEvent, DailyStats, FocusSession, ProjectStats, WeeklyReport, WorkIntent } from './types';

const STORAGE_KEYS = {
    DAILY_PREFIX: 'devpulse.daily.',
    PROJECTS: 'devpulse.projects',
    FOCUS_SESSIONS: 'devpulse.focusSessions',
    LAST_INSIGHT: 'devpulse.lastInsight'
} as const;

export class StorageManager {
    private readonly context: vscode.ExtensionContext;
    private readonly logger: Logger;

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
    }

    public getTodayKey(): string {
        return this.getDateKey(new Date());
    }

    public getDateKey(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    public getTodayStats(): DailyStats {
        return this.getDayStats(this.getTodayKey());
    }

    public getDayStats(dateKey: string): DailyStats {
        const key = STORAGE_KEYS.DAILY_PREFIX + dateKey;
        const stored = this.context.globalState.get<DailyStats>(key);
        if (stored) { return stored; }
        return this.createEmptyDayStats(dateKey);
    }

    public async saveDayStats(stats: DailyStats): Promise<void> {
        const key = STORAGE_KEYS.DAILY_PREFIX + stats.date;
        try {
            await this.context.globalState.update(key, stats);
        } catch (err) {
            this.logger.error('Failed to save day stats', err);
        }
    }

    public getLastNDays(n: number): DailyStats[] {
        const results: DailyStats[] = [];
        const now = new Date();
        for (let i = 0; i < n; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            results.push(this.getDayStats(this.getDateKey(d)));
        }
        return results.reverse();
    }

    public getProjectStats(): Record<string, ProjectStats> {
        return this.context.globalState.get<Record<string, ProjectStats>>(STORAGE_KEYS.PROJECTS, {});
    }

    public async saveProjectStats(stats: Record<string, ProjectStats>): Promise<void> {
        try {
            await this.context.globalState.update(STORAGE_KEYS.PROJECTS, stats);
        } catch (err) {
            this.logger.error('Failed to save project stats', err);
        }
    }

    public updateProjectStats(project: string, seconds: number, language: string, branch: string, intent: WorkIntent): void {
        const all = this.getProjectStats();
        if (!all[project]) {
            all[project] = {
                name: project,
                totalSeconds: 0,
                lastActive: Date.now(),
                languages: {},
                branches: [],
                intentBreakdown: { creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0 }
            };
        }
        const proj = all[project];
        proj.totalSeconds += seconds;
        proj.lastActive = Date.now();
        proj.languages[language] = (proj.languages[language] ?? 0) + seconds;
        if (!proj.branches.includes(branch) && branch) {
            proj.branches.push(branch);
        }
        proj.intentBreakdown[intent] = (proj.intentBreakdown[intent] ?? 0) + seconds;
        this.saveProjectStats(all).catch(() => {});
    }

    public getFocusSessions(): FocusSession[] {
        return this.context.globalState.get<FocusSession[]>(STORAGE_KEYS.FOCUS_SESSIONS, []);
    }

    public async saveFocusSession(session: FocusSession): Promise<void> {
        const sessions = this.getFocusSessions();
        const idx = sessions.findIndex(s => s.id === session.id);
        if (idx >= 0) {
            sessions[idx] = session;
        } else {
            sessions.push(session);
        }
        // Keep only last 100 sessions
        const trimmed = sessions.slice(-100);
        try {
            await this.context.globalState.update(STORAGE_KEYS.FOCUS_SESSIONS, trimmed);
        } catch (err) {
            this.logger.error('Failed to save focus session', err);
        }
    }

    public async clearAllData(): Promise<void> {
        const keys = this.context.globalState.keys();
        for (const key of keys) {
            if (key.startsWith('devpulse.')) {
                await this.context.globalState.update(key, undefined);
            }
        }
        this.logger.info('All DevPulse data cleared.');
    }

    public async exportAll(): Promise<Record<string, unknown>> {
        const keys = this.context.globalState.keys();
        const result: Record<string, unknown> = {};
        for (const key of keys) {
            if (key.startsWith('devpulse.')) {
                result[key] = this.context.globalState.get(key);
            }
        }
        return result;
    }

    public pruneOldData(retentionDays: number): void {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        const keys = this.context.globalState.keys();
        for (const key of keys) {
            if (key.startsWith(STORAGE_KEYS.DAILY_PREFIX)) {
                const dateStr = key.replace(STORAGE_KEYS.DAILY_PREFIX, '');
                if (new Date(dateStr) < cutoff) {
                    this.context.globalState.update(key, undefined).catch(() => {});
                }
            }
        }
    }

    private createEmptyDayStats(dateKey: string): DailyStats {
        return {
            date: dateKey,
            totalActiveSeconds: 0,
            totalIdleSeconds: 0,
            intentBreakdown: { creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0 },
            languageBreakdown: {},
            projectBreakdown: {},
            contextSwitches: 0,
            longestFocusSeconds: 0,
            peakHour: -1,
            hourlyActivity: new Array(24).fill(0),
            focusSessions: [],
            filesEdited: 0
        };
    }
}
