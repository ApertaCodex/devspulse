import * as vscode from 'vscode';
import { Logger } from './logger';
import { ActivityTracker } from './ActivityTracker';
import { FocusSessionManager } from './FocusSessionManager';

export class StatusBarManager implements vscode.Disposable {
    private readonly activityTracker: ActivityTracker;
    private readonly focusSessionManager: FocusSessionManager;
    private readonly logger: Logger;
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly focusStatusItem: vscode.StatusBarItem;

    constructor(
        activityTracker: ActivityTracker,
        focusSessionManager: FocusSessionManager,
        logger: Logger
    ) {
        this.activityTracker = activityTracker;
        this.focusSessionManager = focusSessionManager;
        this.logger = logger;

        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'devpulse.openDashboard';
        this.statusBarItem.tooltip = 'DevPulse — Click to open dashboard';

        this.focusStatusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.focusStatusItem.command = 'devpulse.stopFocusSession';
        this.focusStatusItem.tooltip = 'Focus session active — Click to stop';

        this.update();

        // Listen to focus changes
        focusSessionManager.onDidChange(() => this.update());
    }

    public update(): void {
        const cfg = vscode.workspace.getConfiguration('devpulse');
        const showStatusBar = cfg.get<boolean>('showStatusBar', true);
        const enabled = cfg.get<boolean>('enabled', true);

        if (!showStatusBar) {
            this.statusBarItem.hide();
            this.focusStatusItem.hide();
            return;
        }

        const totalSeconds = this.activityTracker.getTodayActiveSeconds();
        const format = cfg.get<string>('statusBarFormat', 'time+intent');

        let text = '';
        if (!enabled) {
            text = '$(debug-pause) DevPulse: Paused';
        } else if (format === 'time') {
            text = `$(clock) ${this.formatDuration(totalSeconds)}`;
        } else if (format === 'time+intent') {
            const intentIcon = this.getIntentIcon(this.activityTracker.getCurrentIntent());
            const idle = this.activityTracker.isCurrentlyIdle();
            text = idle
                ? `$(coffee) ${this.formatDuration(totalSeconds)} · idle`
                : `${intentIcon} ${this.formatDuration(totalSeconds)}`;
        } else {
            // focus mode
            const session = this.focusSessionManager.getCurrentSession();
            if (session) {
                const elapsed = this.focusSessionManager.getElapsedMinutes();
                text = `$(target) ${elapsed}/${session.goalMinutes}m`;
            } else {
                text = `$(clock) ${this.formatDuration(totalSeconds)}`;
            }
        }

        this.statusBarItem.text = text;
        this.statusBarItem.show();

        // Focus session item
        const session = this.focusSessionManager.getCurrentSession();
        if (session) {
            const elapsed = this.focusSessionManager.getElapsedMinutes();
            const progress = Math.min(100, Math.round((elapsed / session.goalMinutes) * 100));
            this.focusStatusItem.text = `$(target) Focus: ${elapsed}m/${session.goalMinutes}m (${progress}%)`;
            this.focusStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.focusStatusItem.show();
        } else {
            this.focusStatusItem.hide();
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
        this.focusStatusItem.dispose();
    }

    private formatDuration(seconds: number): string {
        if (seconds < 60) { return `${Math.round(seconds)}s`; }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h === 0) { return `${m}m`; }
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    private getIntentIcon(intent: string): string {
        const icons: Record<string, string> = {
            creating: '$(add)',
            debugging: '$(debug)',
            refactoring: '$(edit)',
            exploring: '$(search)',
            idle: '$(coffee)',
            unknown: '$(pulse)'
        };
        return icons[intent] ?? '$(pulse)';
    }
}
