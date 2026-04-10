import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { InsightsEngine } from './InsightsEngine';
import { WorkIntent } from './types';

interface HeartbeatState {
    filePath: string;
    language: string;
    project: string;
    branch: string;
    lastActiveAt: number;
    sessionStartAt: number;
    currentIntent: WorkIntent;
    contextSwitches: number;
    currentFileEnteredAt: number;
    lastSavedAt: number;
    currentFocusStart: number;
    longestFocusSoFar: number;
}

export class ActivityTracker implements vscode.Disposable {
    private readonly context: vscode.ExtensionContext;
    private readonly storageManager: StorageManager;
    private readonly insightsEngine: InsightsEngine;
    private readonly logger: Logger;
    private readonly disposables: vscode.Disposable[] = [];
    private heartbeatTimer?: ReturnType<typeof setInterval>;
    private saveTimer?: ReturnType<typeof setInterval>;
    private isEnabled = false;
    private isIdle = false;
    private state: HeartbeatState;
    private totalTodaySeconds = 0;
    private lastSavedTodaySeconds = 0;

    constructor(
        context: vscode.ExtensionContext,
        storageManager: StorageManager,
        insightsEngine: InsightsEngine,
        logger: Logger
    ) {
        this.context = context;
        this.storageManager = storageManager;
        this.insightsEngine = insightsEngine;
        this.logger = logger;
        this.state = this.createInitialState();
        this.loadTodaySeconds();
    }

    public enable(): void {
        if (this.isEnabled) { return; }
        this.isEnabled = true;
        this.registerListeners();
        this.startHeartbeat();
        this.startSaveTimer();
        this.logger.info('Activity tracking enabled.');
    }

    public disable(): void {
        if (!this.isEnabled) { return; }
        this.isEnabled = false;
        this.flushToStorage();
        this.stopTimers();
        this.clearListeners();
        this.logger.info('Activity tracking disabled.');
    }

    public getTodayActiveSeconds(): number {
        return this.totalTodaySeconds;
    }

    public getCurrentProject(): string {
        return this.state.project;
    }

    public getCurrentLanguage(): string {
        return this.state.language;
    }

    public getCurrentIntent(): WorkIntent {
        return this.state.currentIntent;
    }

    public isCurrentlyIdle(): boolean {
        return this.isIdle;
    }

    public dispose(): void {
        this.disable();
    }

    private createInitialState(): HeartbeatState {
        const now = Date.now();
        return {
            filePath: '',
            language: '',
            project: this.resolveCurrentProject(),
            branch: '',
            lastActiveAt: now,
            sessionStartAt: now,
            currentIntent: 'unknown',
            contextSwitches: 0,
            currentFileEnteredAt: now,
            lastSavedAt: now,
            currentFocusStart: now,
            longestFocusSoFar: 0
        };
    }

    private resolveCurrentProject(): string {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return path.basename(folders[0].uri.fsPath);
        }
        return 'Unknown Project';
    }

    private registerListeners(): void {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.onFileChange(editor.document);
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (!event.contentChanges.length) { return; }
                this.onTextChange(event);
            }),
            vscode.window.onDidChangeTextEditorSelection(() => {
                this.onActivity();
            }),
            vscode.workspace.onDidOpenTextDocument(doc => {
                this.onActivity();
            }),
            vscode.workspace.onDidSaveTextDocument(() => {
                this.onActivity();
            })
        );

        // Initialize with current active editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            this.onFileChange(activeEditor.document);
        }
    }

    private clearListeners(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => this.heartbeat(), 5_000);
    }

    private startSaveTimer(): void {
        this.saveTimer = setInterval(() => this.flushToStorage(), 30_000);
    }

    private stopTimers(): void {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); }
        if (this.saveTimer) { clearInterval(this.saveTimer); }
    }

    private onFileChange(document: vscode.TextDocument): void {
        const cfg = vscode.workspace.getConfiguration('devpulse');
        const excludes = cfg.get<string[]>('excludePatterns', []);
        const filePath = document.uri.fsPath;
        if (this.shouldExclude(filePath, excludes)) { return; }

        const now = Date.now();
        const prevFile = this.state.filePath;
        const timeInPrevFile = (now - this.state.currentFileEnteredAt) / 1000;

        // Context switch detection
        const switchThreshold = cfg.get<number>('contextSwitchThresholdSeconds', 30);
        if (prevFile && prevFile !== filePath && timeInPrevFile >= switchThreshold) {
            this.state.contextSwitches++;
            const cfg2 = vscode.workspace.getConfiguration('devpulse');
            if (cfg2.get<boolean>('notifyContextSwitching', false) && this.state.contextSwitches % 5 === 0) {
                vscode.window.showWarningMessage(
                    `$(warning) DevPulse: You've switched context ${this.state.contextSwitches} times today. Consider batching tasks.`
                );
            }
        }

        this.state.filePath = filePath;
        this.state.language = document.languageId;
        this.state.currentFileEnteredAt = now;
        this.state.project = this.resolveCurrentProject();
        this.onActivity();
    }

    private onTextChange(event: vscode.TextDocumentChangeEvent): void {
        const cfg = vscode.workspace.getConfiguration('devpulse');
        const excludes = cfg.get<string[]>('excludePatterns', []);
        if (this.shouldExclude(event.document.uri.fsPath, excludes)) { return; }

        // Classify intent from change patterns
        const changes = event.contentChanges;
        const totalAdded = changes.reduce((s, c) => s + c.text.length, 0);
        const totalDeleted = changes.reduce((s, c) => s + c.rangeLength, 0);

        if (totalAdded > totalDeleted * 2) {
            this.state.currentIntent = 'creating';
        } else if (totalDeleted > totalAdded * 2) {
            this.state.currentIntent = 'refactoring';
        } else if (totalAdded > 0 && totalDeleted > 0) {
            this.state.currentIntent = 'debugging';
        } else {
            this.state.currentIntent = 'exploring';
        }

        this.onActivity();
    }

    private onActivity(): void {
        const now = Date.now();
        if (this.isIdle) {
            this.isIdle = false;
            this.state.currentFocusStart = now;
        }
        this.state.lastActiveAt = now;
    }

    private heartbeat(): void {
        if (!this.isEnabled) { return; }
        const now = Date.now();
        const cfg = vscode.workspace.getConfiguration('devpulse');
        const idleThreshold = cfg.get<number>('idleThresholdMinutes', 5) * 60 * 1000;
        const timeSinceActive = now - this.state.lastActiveAt;

        if (timeSinceActive > idleThreshold) {
            if (!this.isIdle) {
                this.isIdle = true;
                // Track focus duration before going idle
                const focusDuration = (now - this.state.currentFocusStart) / 1000;
                if (focusDuration > this.state.longestFocusSoFar) {
                    this.state.longestFocusSoFar = focusDuration;
                }
            }
            return;
        }

        // Accumulate 5 seconds of active time
        this.totalTodaySeconds += 5;
    }

    private async flushToStorage(): Promise<void> {
        if (this.totalTodaySeconds === this.lastSavedTodaySeconds) { return; }
        try {
            const stats = this.storageManager.getTodayStats();
            const delta = this.totalTodaySeconds - this.lastSavedTodaySeconds;
            stats.totalActiveSeconds = this.totalTodaySeconds;

            const hour = new Date().getHours();
            stats.hourlyActivity[hour] = (stats.hourlyActivity[hour] ?? 0) + delta;

            // Update intent breakdown
            const intent = this.state.currentIntent;
            stats.intentBreakdown[intent] = (stats.intentBreakdown[intent] ?? 0) + delta;

            // Update language breakdown
            const lang = this.state.language || 'unknown';
            stats.languageBreakdown[lang] = (stats.languageBreakdown[lang] ?? 0) + delta;

            // Update project breakdown
            const proj = this.state.project || 'Unknown Project';
            stats.projectBreakdown[proj] = (stats.projectBreakdown[proj] ?? 0) + delta;

            // Context switches
            stats.contextSwitches = this.state.contextSwitches;

            // Longest focus
            if (this.state.longestFocusSoFar > stats.longestFocusSeconds) {
                stats.longestFocusSeconds = this.state.longestFocusSoFar;
            }

            // Peak hour
            let maxHour = 0;
            let maxVal = 0;
            for (let i = 0; i < 24; i++) {
                if (stats.hourlyActivity[i] > maxVal) {
                    maxVal = stats.hourlyActivity[i];
                    maxHour = i;
                }
            }
            stats.peakHour = maxHour;

            await this.storageManager.saveDayStats(stats);

            // Update project stats
            this.storageManager.updateProjectStats(proj, delta, lang, this.state.branch, intent);

            this.lastSavedTodaySeconds = this.totalTodaySeconds;

            // Prune old data
            const retentionDays = vscode.workspace.getConfiguration('devpulse').get<number>('dataRetentionDays', 90);
            this.storageManager.pruneOldData(retentionDays);
        } catch (err) {
            this.logger.error('Failed to flush activity to storage', err);
        }
    }

    private loadTodaySeconds(): void {
        const stats = this.storageManager.getTodayStats();
        this.totalTodaySeconds = stats.totalActiveSeconds;
        this.lastSavedTodaySeconds = stats.totalActiveSeconds;
    }

    private shouldExclude(filePath: string, patterns: string[]): boolean {
        for (const pattern of patterns) {
            const normalized = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            if (filePath.includes(normalized.replace(/\//g, path.sep))) {
                return true;
            }
        }
        return false;
    }
}
