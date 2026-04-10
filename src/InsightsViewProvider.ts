import * as vscode from 'vscode';
import { Logger } from './logger';
import { InsightsEngine } from './InsightsEngine';
import { StorageManager } from './StorageManager';
import { AIInsight } from './types';

type InsightItem = vscode.TreeItem & { children?: InsightItem[] };

export class InsightsViewProvider implements vscode.TreeDataProvider<InsightItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<InsightItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly insightsEngine: InsightsEngine;
    private readonly storageManager: StorageManager;
    private readonly logger: Logger;
    private cachedInsight: AIInsight | null = null;

    constructor(insightsEngine: InsightsEngine, storageManager: StorageManager, logger: Logger) {
        this.insightsEngine = insightsEngine;
        this.storageManager = storageManager;
        this.logger = logger;
    }

    public refresh(): void {
        this.cachedInsight = null;
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: InsightItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: InsightItem): InsightItem[] {
        if (element) {
            return element.children ?? [];
        }
        return this.buildItems();
    }

    private buildItems(): InsightItem[] {
        try {
            const items: InsightItem[] = [];

            // Quick stats
            const quickStats = this.insightsEngine.getQuickStats();
            const statsParent = this.makeItem('Quick Stats', 'graph', vscode.TreeItemCollapsibleState.Expanded);
            statsParent.children = quickStats.map(s => {
                const item = this.makeItem(s.label, s.icon.replace(/^\$\((.+)\)$/, '$1'), vscode.TreeItemCollapsibleState.None);
                item.description = s.value;
                return item;
            });
            items.push(statsParent);

            // AI Insights (use cached or placeholder)
            if (this.cachedInsight) {
                const aiParent = this.makeItem('AI Coaching', 'sparkle', vscode.TreeItemCollapsibleState.Expanded);
                aiParent.children = [];

                const headlineItem = this.makeItem(this.cachedInsight.headline, 'lightbulb', vscode.TreeItemCollapsibleState.None);
                headlineItem.tooltip = this.cachedInsight.summary;
                aiParent.children.push(headlineItem);

                const scoreItem = this.makeItem(`Productivity Score: ${this.cachedInsight.productivityScore}/100`, 'star', vscode.TreeItemCollapsibleState.None);
                scoreItem.description = `Focus: ${this.cachedInsight.focusScore}/10`;
                aiParent.children.push(scoreItem);

                const peakItem = this.makeItem(`Peak Hours: ${this.cachedInsight.peakHours}`, 'flame', vscode.TreeItemCollapsibleState.None);
                aiParent.children.push(peakItem);

                if (this.cachedInsight.contextSwitchWarning) {
                    const warnItem = this.makeItem('Context Switch Warning', 'warning', vscode.TreeItemCollapsibleState.None);
                    warnItem.description = this.cachedInsight.contextSwitchWarning;
                    warnItem.tooltip = this.cachedInsight.contextSwitchWarning;
                    aiParent.children.push(warnItem);
                }

                const tipsParent = this.makeItem('Recommendations', 'checklist', vscode.TreeItemCollapsibleState.Expanded);
                tipsParent.children = this.cachedInsight.tips.map((tip, i) => {
                    const tipItem = this.makeItem(`Tip ${i + 1}`, 'arrow-right', vscode.TreeItemCollapsibleState.None);
                    tipItem.description = tip.length > 60 ? tip.slice(0, 57) + '...' : tip;
                    tipItem.tooltip = tip;
                    return tipItem;
                });
                aiParent.children.push(tipsParent);

                items.push(aiParent);
            } else {
                const generateItem = this.makeItem('Generate AI Insights', 'sparkle', vscode.TreeItemCollapsibleState.None);
                generateItem.command = { command: 'devpulse.showAIInsights', title: 'Generate AI Insights' };
                generateItem.description = 'Click to analyze your patterns';
                items.push(generateItem);
            }

            // 7-day trend
            const last7 = this.storageManager.getLastNDays(7);
            const trendParent = this.makeItem('7-Day Trend', 'graph-line', vscode.TreeItemCollapsibleState.Collapsed);
            trendParent.children = last7.map(day => {
                const item = this.makeItem(day.date, 'calendar', vscode.TreeItemCollapsibleState.None);
                item.description = day.totalActiveSeconds > 0
                    ? this.insightsEngine.formatDuration(day.totalActiveSeconds)
                    : 'No activity';
                return item;
            });
            items.push(trendParent);

            return items;
        } catch (err) {
            this.logger.error('InsightsViewProvider error', err);
            return [this.makeItem('Error loading insights', 'error', vscode.TreeItemCollapsibleState.None)];
        }
    }

    public setCachedInsight(insight: AIInsight): void {
        this.cachedInsight = insight;
        this._onDidChangeTreeData.fire();
    }

    private makeItem(label: string, icon: string, collapsible: vscode.TreeItemCollapsibleState): InsightItem {
        const item = new vscode.TreeItem(label, collapsible) as InsightItem;
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
}
