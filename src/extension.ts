import * as vscode from 'vscode';
import { Logger } from './logger';
import { ActivityTracker } from './ActivityTracker';
import { InsightsEngine } from './InsightsEngine';
import { FocusSessionManager } from './FocusSessionManager';
import { StorageManager } from './StorageManager';
import { StatusBarManager } from './StatusBarManager';
import { TodayViewProvider } from './TodayViewProvider';
import { InsightsViewProvider } from './InsightsViewProvider';
import { ProjectsViewProvider } from './ProjectsViewProvider';
import { FocusViewProvider } from './FocusViewProvider';
import { DashboardPanel } from './DashboardPanel';

export let logger: Logger;
export let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext): void {
    extensionContext = context;
    logger = new Logger('DevPulse');
    logger.info('DevPulse activating...');

    const config = vscode.workspace.getConfiguration('devpulse');
    const enabled = config.get<boolean>('enabled', true);

    // Core services
    const storageManager = new StorageManager(context, logger);
    const insightsEngine = new InsightsEngine(storageManager, logger);
    const activityTracker = new ActivityTracker(context, storageManager, insightsEngine, logger);
    const focusSessionManager = new FocusSessionManager(context, storageManager, logger);
    const statusBarManager = new StatusBarManager(activityTracker, focusSessionManager, logger);

    // Tree view providers
    const todayProvider = new TodayViewProvider(storageManager, activityTracker, logger);
    const insightsProvider = new InsightsViewProvider(insightsEngine, storageManager, logger);
    const projectsProvider = new ProjectsViewProvider(storageManager, logger);
    const focusProvider = new FocusViewProvider(focusSessionManager, storageManager, logger);

    // Register tree views
    const todayView = vscode.window.createTreeView('devpulse.todayView', {
        treeDataProvider: todayProvider,
        showCollapseAll: false
    });
    const insightsView = vscode.window.createTreeView('devpulse.insightsView', {
        treeDataProvider: insightsProvider,
        showCollapseAll: false
    });
    const projectsView = vscode.window.createTreeView('devpulse.projectsView', {
        treeDataProvider: projectsProvider,
        showCollapseAll: true
    });
    const focusView = vscode.window.createTreeView('devpulse.focusView', {
        treeDataProvider: focusProvider,
        showCollapseAll: false
    });

    context.subscriptions.push(todayView, insightsView, projectsView, focusView);

    // Refresh all views helper
    const refreshAllViews = () => {
        todayProvider.refresh();
        insightsProvider.refresh();
        projectsProvider.refresh();
        focusProvider.refresh();
        statusBarManager.update();
    };

    // Periodic refresh every 60 seconds
    const refreshInterval = setInterval(refreshAllViews, 60_000);
    context.subscriptions.push({ dispose: () => clearInterval(refreshInterval) });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('devpulse.refresh', () => {
            refreshAllViews();
            logger.info('Views refreshed manually.');
        }),

        vscode.commands.registerCommand('devpulse.openDashboard', () => {
            DashboardPanel.createOrShow(context, storageManager, insightsEngine, focusSessionManager, logger);
        }),

        vscode.commands.registerCommand('devpulse.startFocusSession', async () => {
            const goal = await vscode.window.showInputBox({
                prompt: 'What will you focus on? (optional)',
                placeHolder: 'e.g. Implement authentication module'
            });
            const cfg = vscode.workspace.getConfiguration('devpulse');
            const durationStr = await vscode.window.showInputBox({
                prompt: 'Focus session duration (minutes)',
                value: String(cfg.get<number>('focusSessionGoalMinutes', 90)),
                validateInput: (v) => isNaN(Number(v)) || Number(v) < 1 ? 'Enter a valid number' : undefined
            });
            if (durationStr === undefined) { return; }
            const duration = Number(durationStr);
            focusSessionManager.startSession(goal ?? 'Focus Session', duration);
            await vscode.commands.executeCommand('setContext', 'devpulse.focusActive', true);
            refreshAllViews();
            vscode.window.showInformationMessage(`$(target) Focus session started! Goal: ${duration} minutes.`);
        }),

        vscode.commands.registerCommand('devpulse.stopFocusSession', async () => {
            const summary = focusSessionManager.stopSession();
            await vscode.commands.executeCommand('setContext', 'devpulse.focusActive', false);
            refreshAllViews();
            if (summary) {
                vscode.window.showInformationMessage(
                    `$(check) Focus session complete! Duration: ${summary.durationMinutes}m | Score: ${summary.flowScore}/10`
                );
            }
        }),

        vscode.commands.registerCommand('devpulse.showWeeklyReport', () => {
            DashboardPanel.createOrShow(context, storageManager, insightsEngine, focusSessionManager, logger, 'weekly');
        }),

        vscode.commands.registerCommand('devpulse.toggleTracking', async () => {
            const cfg = vscode.workspace.getConfiguration('devpulse');
            const current = cfg.get<boolean>('enabled', true);
            await cfg.update('enabled', !current, vscode.ConfigurationTarget.Global);
            if (!current) {
                activityTracker.enable();
                vscode.window.showInformationMessage('$(record) DevPulse tracking enabled.');
            } else {
                activityTracker.disable();
                vscode.window.showInformationMessage('$(debug-pause) DevPulse tracking paused.');
            }
            statusBarManager.update();
        }),

        vscode.commands.registerCommand('devpulse.clearData', async () => {
            const answer = await vscode.window.showWarningMessage(
                'Are you sure you want to clear ALL DevPulse tracking data? This cannot be undone.',
                { modal: true },
                'Clear All Data'
            );
            if (answer === 'Clear All Data') {
                await storageManager.clearAllData();
                refreshAllViews();
                vscode.window.showInformationMessage('$(trash) All DevPulse data cleared.');
            }
        }),

        vscode.commands.registerCommand('devpulse.exportData', async () => {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Exporting DevPulse data...' },
                async () => {
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file('devpulse-export.json'),
                        filters: { 'JSON': ['json'] }
                    });
                    if (!uri) { return; }
                    const data = await storageManager.exportAll();
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
                    vscode.window.showInformationMessage(`$(export) Data exported to ${uri.fsPath}`);
                }
            );
        }),

        vscode.commands.registerCommand('devpulse.showAIInsights', async () => {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '$(sparkle) Generating AI insights...' },
                async () => {
                    const insights = await insightsEngine.generateAIInsights();
                    insightsProvider.refresh();
                    DashboardPanel.createOrShow(context, storageManager, insightsEngine, focusSessionManager, logger, 'insights');
                    vscode.window.showInformationMessage(`$(sparkle) ${insights.headline}`);
                }
            );
        }),

        vscode.commands.registerCommand('devpulse.configureSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'devpulse');
        })
    );

    // Start tracking if enabled
    if (enabled) {
        activityTracker.enable();
        vscode.commands.executeCommand('setContext', 'devpulse.focusActive', false);
    }

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('devpulse')) {
                statusBarManager.update();
                refreshAllViews();
            }
        })
    );

    // Dispose all managers
    context.subscriptions.push(
        activityTracker,
        statusBarManager,
        focusSessionManager
    );

    logger.info('DevPulse activated successfully.');
    statusBarManager.update();
}

export function deactivate(): void {
    logger?.info('DevPulse deactivated.');
}
