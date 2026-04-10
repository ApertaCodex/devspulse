import * as vscode from 'vscode';
import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { FocusSession } from './types';

export class FocusSessionManager implements vscode.Disposable {
    private readonly context: vscode.ExtensionContext;
    private readonly storageManager: StorageManager;
    private readonly logger: Logger;
    private currentSession: FocusSession | null = null;
    private sessionTimer?: ReturnType<typeof setInterval>;
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;
    private contextSwitchCount = 0;
    private lastFile = '';

    constructor(context: vscode.ExtensionContext, storageManager: StorageManager, logger: Logger) {
        this.context = context;
        this.storageManager = storageManager;
        this.logger = logger;
    }

    public startSession(goal: string, goalMinutes: number): void {
        if (this.currentSession) {
            this.stopSession();
        }
        const id = `focus-${Date.now()}`;
        const folders = vscode.workspace.workspaceFolders;
        const project = folders ? folders[0].name : 'Unknown';

        this.currentSession = {
            id,
            goal,
            startTime: Date.now(),
            durationMinutes: 0,
            goalMinutes,
            flowScore: 0,
            contextSwitches: 0,
            interruptions: 0,
            filesWorkedOn: [],
            project
        };
        this.contextSwitchCount = 0;

        // Track file switches during focus session
        const editorDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!this.currentSession || !editor) { return; }
            const file = editor.document.uri.fsPath;
            if (file !== this.lastFile) {
                this.contextSwitchCount++;
                this.currentSession.contextSwitches = this.contextSwitchCount;
                if (!this.currentSession.filesWorkedOn.includes(file)) {
                    this.currentSession.filesWorkedOn.push(file);
                }
                this.lastFile = file;
            }
        });
        this.context.subscriptions.push(editorDisposable);

        // Goal timer
        const goalMs = goalMinutes * 60 * 1000;
        const goalTimer = setTimeout(() => {
            if (this.currentSession) {
                vscode.window.showInformationMessage(
                    `$(target) Focus goal reached! ${goalMinutes} minutes completed. Keep going or stop the session.`,
                    'Stop Session'
                ).then(choice => {
                    if (choice === 'Stop Session') {
                        vscode.commands.executeCommand('devpulse.stopFocusSession');
                    }
                });
            }
        }, goalMs);
        this.context.subscriptions.push({ dispose: () => clearTimeout(goalTimer) });

        // Update timer every minute
        this.sessionTimer = setInterval(() => {
            if (this.currentSession) {
                const elapsed = (Date.now() - this.currentSession.startTime) / 60000;
                this.currentSession.durationMinutes = Math.round(elapsed);
                this._onDidChange.fire();
            }
        }, 60_000);

        this.logger.info(`Focus session started: ${goal} (${goalMinutes}m)`);
        this._onDidChange.fire();
    }

    public stopSession(): FocusSession | null {
        if (!this.currentSession) { return null; }

        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = undefined;
        }

        const session = this.currentSession;
        session.endTime = Date.now();
        session.durationMinutes = Math.round((session.endTime - session.startTime) / 60000);

        // Calculate flow score (0-10)
        const goalRatio = Math.min(1, session.durationMinutes / session.goalMinutes);
        const switchPenalty = Math.min(1, session.contextSwitches / 20);
        session.flowScore = Math.round((goalRatio * 8 + (1 - switchPenalty) * 2) * 10) / 10;

        this.storageManager.saveFocusSession(session).catch(() => {});

        // Add to today's stats
        const todayStats = this.storageManager.getTodayStats();
        todayStats.focusSessions.push(session);
        this.storageManager.saveDayStats(todayStats).catch(() => {});

        this.currentSession = null;
        this.logger.info(`Focus session ended. Duration: ${session.durationMinutes}m, Flow: ${session.flowScore}/10`);
        this._onDidChange.fire();
        return session;
    }

    public getCurrentSession(): FocusSession | null {
        return this.currentSession;
    }

    public isActive(): boolean {
        return this.currentSession !== null;
    }

    public getElapsedMinutes(): number {
        if (!this.currentSession) { return 0; }
        return Math.round((Date.now() - this.currentSession.startTime) / 60000);
    }

    public getRecentSessions(limit = 10): FocusSession[] {
        return this.storageManager.getFocusSessions().slice(-limit).reverse();
    }

    public dispose(): void {
        if (this.currentSession) {
            this.stopSession();
        }
        this._onDidChange.dispose();
    }
}
