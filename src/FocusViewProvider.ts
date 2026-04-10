import * as vscode from 'vscode';
import { Logger } from './logger';
import { FocusSessionManager } from './FocusSessionManager';
import { StorageManager } from './StorageManager';
import { InsightsEngine } from './InsightsEngine';
import { FocusSession } from './types';

type FocusItem = vscode.TreeItem & { children?: FocusItem[] };

export class FocusViewProvider implements vscode.TreeDataProvider<FocusItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FocusItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly focusSessionManager: FocusSessionManager;
    private readonly storageManager: StorageManager;
    private readonly logger: Logger;
    private readonly insightsEngine: InsightsEngine;

    constructor(focusSessionManager: FocusSessionManager, storageManager: StorageManager, logger: Logger) {
        this.focusSessionManager = focusSessionManager;
        this.storageManager = storageManager;
        this.logger = logger;
        this.insightsEngine = new InsightsEngine(storageManager, logger);

        focusSessionManager.onDidChange(() => this.refresh());
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: FocusItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: FocusItem): FocusItem[] {
        if (element) {
            return element.children ?? [];
        }
        return this.buildItems();
    }

    private buildItems(): FocusItem[] {
        const items: FocusItem[] = [];

        // Active session
        const activeSession = this.focusSessionManager.getCurrentSession();
        if (activeSession) {
            const elapsed = this.focusSessionManager.getElapsedMinutes();
            const progress = Math.min(100, Math.round((elapsed / activeSession.goalMinutes) * 100));

            const activeParent = this.makeItem(
                `Active: ${activeSession.goal}`,
                'target',
                vscode.TreeItemCollapsibleState.Expanded
            );
            activeParent.description = `${elapsed}/${activeSession.goalMinutes}m`;
            activeParent.tooltip = `Focus session in progress — ${progress}% complete`;

            activeParent.children = [
                this.makeStatItem('Progress', `${progress}%`, 'loading~spin'),
                this.makeStatItem('Context Switches', String(activeSession.contextSwitches), 'arrow-swap'),
                this.makeStatItem('Files', String(activeSession.filesWorkedOn.length), 'file-code'),
                this.makeStatItem('Project', activeSession.project, 'folder')
            ];

            const stopItem = this.makeItem('Stop Focus Session', 'debug-stop', vscode.TreeItemCollapsibleState.None);
            stopItem.command = { command: 'devpulse.stopFocusSession', title: 'Stop Focus Session' };
            stopItem.description = 'Click to end session';

            items.push(activeParent, stopItem);
        } else {
            const startItem = this.makeItem('Start Focus Session', 'target', vscode.TreeItemCollapsibleState.None);
            startItem.command = { command: 'devpulse.startFocusSession', title: 'Start Focus Session' };
            startItem.description = 'Ctrl+Alt+F';
            items.push(startItem);
        }

        // Recent sessions
        const recentSessions = this.focusSessionManager.getRecentSessions(5);
        if (recentSessions.length > 0) {
            const recentParent = this.makeItem('Recent Sessions', 'history', vscode.TreeItemCollapsibleState.Expanded);
            recentParent.children = recentSessions.map(s => this.buildSessionItem(s));
            items.push(recentParent);
        }

        // Stats
        const allSessions = this.storageManager.getFocusSessions();
        if (allSessions.length > 0) {
            const avgFlow = allSessions.reduce((s, f) => s + f.flowScore, 0) / allSessions.length;
            const totalFocusTime = allSessions.reduce((s, f) => s + f.durationMinutes, 0);
            const statsParent = this.makeItem('All-Time Stats', 'graph', vscode.TreeItemCollapsibleState.Collapsed);
            statsParent.children = [
                this.makeStatItem('Total Sessions', String(allSessions.length), 'number'),
                this.makeStatItem('Total Focus Time', this.insightsEngine.formatDuration(totalFocusTime * 60), 'clock'),
                this.makeStatItem('Avg Flow Score', `${Math.round(avgFlow * 10) / 10}/10`, 'star')
            ];
            items.push(statsParent);
        }

        return items;
    }

    private buildSessionItem(session: FocusSession): FocusItem {
        const item = this.makeItem(
            session.goal,
            session.flowScore >= 7 ? 'star-full' : session.flowScore >= 4 ? 'star-half' : 'star-empty',
            vscode.TreeItemCollapsibleState.None
        );
        item.description = `${session.durationMinutes}m · Flow: ${session.flowScore}/10`;
        item.tooltip = `Started: ${new Date(session.startTime).toLocaleString()}\nSwitches: ${session.contextSwitches}`;
        return item;
    }

    private makeStatItem(label: string, value: string, icon: string): FocusItem {
        const item = this.makeItem(label, icon, vscode.TreeItemCollapsibleState.None);
        item.description = value;
        return item;
    }

    private makeItem(label: string, icon: string, collapsible: vscode.TreeItemCollapsibleState): FocusItem {
        const item = new vscode.TreeItem(label, collapsible) as FocusItem;
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
}
