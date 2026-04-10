import * as vscode from 'vscode';
import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { InsightsEngine } from './InsightsEngine';
import { ProjectStats, WorkIntent } from './types';

type ProjectItem = vscode.TreeItem & { children?: ProjectItem[] };

export class ProjectsViewProvider implements vscode.TreeDataProvider<ProjectItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly storageManager: StorageManager;
    private readonly logger: Logger;
    private readonly insightsEngine: InsightsEngine;

    constructor(storageManager: StorageManager, logger: Logger) {
        this.storageManager = storageManager;
        this.logger = logger;
        this.insightsEngine = new InsightsEngine(storageManager, logger);
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: ProjectItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ProjectItem): ProjectItem[] {
        if (element) {
            return element.children ?? [];
        }
        return this.buildItems();
    }

    private buildItems(): ProjectItem[] {
        try {
            const projects = this.storageManager.getProjectStats();
            const sorted = Object.values(projects).sort((a, b) => b.totalSeconds - a.totalSeconds);

            if (sorted.length === 0) {
                const empty = new vscode.TreeItem('No projects tracked yet') as ProjectItem;
                empty.iconPath = new vscode.ThemeIcon('info');
                empty.description = 'Open a workspace to start tracking';
                return [empty];
            }

            return sorted.map(proj => this.buildProjectItem(proj));
        } catch (err) {
            this.logger.error('ProjectsViewProvider error', err);
            return [];
        }
    }

    private buildProjectItem(proj: ProjectStats): ProjectItem {
        const item = new vscode.TreeItem(proj.name, vscode.TreeItemCollapsibleState.Collapsed) as ProjectItem;
        item.iconPath = new vscode.ThemeIcon('folder');
        item.description = this.insightsEngine.formatDuration(proj.totalSeconds);
        item.tooltip = `Last active: ${new Date(proj.lastActive).toLocaleString()}`;
        item.children = this.buildProjectChildren(proj);
        return item;
    }

    private buildProjectChildren(proj: ProjectStats): ProjectItem[] {
        const children: ProjectItem[] = [];

        // Languages
        const langParent = new vscode.TreeItem('Languages', vscode.TreeItemCollapsibleState.Expanded) as ProjectItem;
        langParent.iconPath = new vscode.ThemeIcon('code');
        langParent.children = Object.entries(proj.languages)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([lang, secs]) => {
                const langItem = new vscode.TreeItem(lang, vscode.TreeItemCollapsibleState.None) as ProjectItem;
                langItem.iconPath = new vscode.ThemeIcon('symbol-file');
                langItem.description = this.insightsEngine.formatDuration(secs);
                return langItem;
            });
        if (langParent.children.length > 0) { children.push(langParent); }

        // Intent breakdown
        const intentParent = new vscode.TreeItem('Work Breakdown', vscode.TreeItemCollapsibleState.Collapsed) as ProjectItem;
        intentParent.iconPath = new vscode.ThemeIcon('pie-chart');
        const intentLabels: Record<WorkIntent, string> = {
            creating: 'Creating', debugging: 'Debugging',
            refactoring: 'Refactoring', exploring: 'Exploring',
            idle: 'Idle', unknown: 'Mixed'
        };
        intentParent.children = Object.entries(proj.intentBreakdown)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([intent, secs]) => {
                const pct = proj.totalSeconds > 0 ? Math.round((secs / proj.totalSeconds) * 100) : 0;
                const intentItem = new vscode.TreeItem(intentLabels[intent as WorkIntent] ?? intent, vscode.TreeItemCollapsibleState.None) as ProjectItem;
                intentItem.iconPath = new vscode.ThemeIcon('symbol-misc');
                intentItem.description = `${this.insightsEngine.formatDuration(secs)} (${pct}%)`;
                return intentItem;
            });
        if (intentParent.children.length > 0) { children.push(intentParent); }

        // Branches
        if (proj.branches.length > 0) {
            const branchParent = new vscode.TreeItem('Branches', vscode.TreeItemCollapsibleState.Collapsed) as ProjectItem;
            branchParent.iconPath = new vscode.ThemeIcon('git-branch');
            branchParent.children = proj.branches.slice(-10).map(b => {
                const bItem = new vscode.TreeItem(b, vscode.TreeItemCollapsibleState.None) as ProjectItem;
                bItem.iconPath = new vscode.ThemeIcon('git-commit');
                return bItem;
            });
            children.push(branchParent);
        }

        return children;
    }
}
