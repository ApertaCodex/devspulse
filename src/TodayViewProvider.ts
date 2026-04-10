import * as vscode from 'vscode';
import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { ActivityTracker } from './ActivityTracker';
import { InsightsEngine } from './InsightsEngine';
import { WorkIntent } from './types';

type TodayTreeItem = vscode.TreeItem & { children?: TodayTreeItem[] };

export class TodayViewProvider implements vscode.TreeDataProvider<TodayTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TodayTreeItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly storageManager: StorageManager;
    private readonly activityTracker: ActivityTracker;
    private readonly logger: Logger;
    private readonly insightsEngine: InsightsEngine;

    constructor(storageManager: StorageManager, activityTracker: ActivityTracker, logger: Logger) {
        this.storageManager = storageManager;
        this.activityTracker = activityTracker;
        this.logger = logger;
        this.insightsEngine = new InsightsEngine(storageManager, logger);
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: TodayTreeItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: TodayTreeItem): TodayTreeItem[] {
        if (element) {
            return element.children ?? [];
        }
        return this.buildRootItems();
    }

    private buildRootItems(): TodayTreeItem[] {
        try {
            const stats = this.storageManager.getTodayStats();
            const items: TodayTreeItem[] = [];

            // Summary header
            const totalItem = this.makeItem(
                `Today: ${this.insightsEngine.formatDuration(stats.totalActiveSeconds)}`,
                '$(clock)',
                vscode.TreeItemCollapsibleState.None
            );
            totalItem.description = new Date().toLocaleDateString();
            totalItem.tooltip = `Total active coding time today`;
            items.push(totalItem);

            // Current status
            const idle = this.activityTracker.isCurrentlyIdle();
            const statusItem = this.makeItem(
                idle ? 'Status: Idle' : `Status: ${this.capitalise(this.activityTracker.getCurrentIntent())}`,
                idle ? '$(coffee)' : this.getIntentIcon(this.activityTracker.getCurrentIntent()),
                vscode.TreeItemCollapsibleState.None
            );
            statusItem.description = idle ? 'No recent activity' : this.activityTracker.getCurrentProject();
            items.push(statusItem);

            // Work intent breakdown
            const intentParent = this.makeItem('Work Breakdown', '$(pie-chart)', vscode.TreeItemCollapsibleState.Expanded);
            intentParent.children = this.buildIntentItems(stats.intentBreakdown, stats.totalActiveSeconds);
            if (intentParent.children.length > 0) { items.push(intentParent); }

            // Language breakdown
            const langParent = this.makeItem('Languages', '$(code)', vscode.TreeItemCollapsibleState.Collapsed);
            langParent.children = this.buildBreakdownItems(stats.languageBreakdown, stats.totalActiveSeconds, '$(symbol-file)');
            if (langParent.children.length > 0) { items.push(langParent); }

            // Stats row
            const statsParent = this.makeItem('Session Stats', '$(graph)', vscode.TreeItemCollapsibleState.Collapsed);
            statsParent.children = [
                this.makeStatItem('Context Switches', String(stats.contextSwitches), '$(arrow-swap)'),
                this.makeStatItem('Longest Focus', this.insightsEngine.formatDuration(stats.longestFocusSeconds), '$(eye)'),
                this.makeStatItem('Peak Hour', stats.peakHour >= 0 ? `${stats.peakHour}:00` : 'N/A', '$(flame)'),
                this.makeStatItem('Files Edited', String(stats.filesEdited), '$(file-code)')
            ];
            items.push(statsParent);

            return items;
        } catch (err) {
            this.logger.error('TodayViewProvider error', err);
            return [this.makeItem('Error loading data', '$(error)', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private buildIntentItems(breakdown: Record<WorkIntent, number>, total: number): TodayTreeItem[] {
        const intentLabels: Record<WorkIntent, string> = {
            creating: 'Creating',
            debugging: 'Debugging',
            refactoring: 'Refactoring',
            exploring: 'Exploring',
            idle: 'Idle',
            unknown: 'Mixed'
        };
        return Object.entries(breakdown)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([intent, secs]) => {
                const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
                const item = this.makeItem(
                    intentLabels[intent as WorkIntent] ?? intent,
                    this.getIntentIcon(intent),
                    vscode.TreeItemCollapsibleState.None
                );
                item.description = `${this.insightsEngine.formatDuration(secs)} (${pct}%)`;
                return item;
            });
    }

    private buildBreakdownItems(map: Record<string, number>, total: number, icon: string): TodayTreeItem[] {
        return Object.entries(map)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([key, secs]) => {
                const pct = total > 0 ? Math.round((secs / total) * 100) : 0;
                const item = this.makeItem(key, icon, vscode.TreeItemCollapsibleState.None);
                item.description = `${this.insightsEngine.formatDuration(secs)} (${pct}%)`;
                return item;
            });
    }

    private makeStatItem(label: string, value: string, icon: string): TodayTreeItem {
        const item = this.makeItem(label, icon, vscode.TreeItemCollapsibleState.None);
        item.description = value;
        return item;
    }

    private makeItem(label: string, icon: string, collapsible: vscode.TreeItemCollapsibleState): TodayTreeItem {
        const item = new vscode.TreeItem(label, collapsible) as TodayTreeItem;
        item.iconPath = new vscode.ThemeIcon(icon.replace(/^\$\((.+)\)$/, '$1'));
        return item;
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

    private capitalise(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
}
