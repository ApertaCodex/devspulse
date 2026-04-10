import { Logger } from './logger';
import { StorageManager } from './StorageManager';
import { AIInsight, DailyStats, WeeklyReport, WorkIntent } from './types';

export class InsightsEngine {
    private readonly storageManager: StorageManager;
    private readonly logger: Logger;
    private cachedInsights: AIInsight | null = null;
    private lastInsightTime = 0;

    constructor(storageManager: StorageManager, logger: Logger) {
        this.storageManager = storageManager;
        this.logger = logger;
    }

    public async generateAIInsights(force = false): Promise<AIInsight> {
        const now = Date.now();
        // Cache insights for 15 minutes
        if (!force && this.cachedInsights && (now - this.lastInsightTime) < 15 * 60 * 1000) {
            return this.cachedInsights;
        }

        try {
            const last7 = this.storageManager.getLastNDays(7);
            const insights = this.computeInsights(last7);
            this.cachedInsights = insights;
            this.lastInsightTime = now;
            return insights;
        } catch (err) {
            this.logger.error('Failed to generate insights', err);
            return this.defaultInsight();
        }
    }

    public getWeeklyReport(): WeeklyReport {
        const last7 = this.storageManager.getLastNDays(7);
        const projects = this.storageManager.getProjectStats();
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 6);

        const totalActive = last7.reduce((s, d) => s + d.totalActiveSeconds, 0);
        const dailyBreakdown = last7.map(d => ({ date: d.date, seconds: d.totalActiveSeconds }));

        // Aggregate language breakdown
        const langMap: Record<string, number> = {};
        for (const day of last7) {
            for (const [lang, secs] of Object.entries(day.languageBreakdown)) {
                langMap[lang] = (langMap[lang] ?? 0) + secs;
            }
        }
        const topLanguages = Object.entries(langMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([language, seconds]) => ({ language, seconds }));

        // Aggregate intent breakdown
        const intentMap: Record<WorkIntent, number> = { creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0 };
        for (const day of last7) {
            for (const [intent, secs] of Object.entries(day.intentBreakdown)) {
                intentMap[intent as WorkIntent] = (intentMap[intent as WorkIntent] ?? 0) + secs;
            }
        }

        // Top projects
        const topProjects = Object.values(projects)
            .sort((a, b) => b.totalSeconds - a.totalSeconds)
            .slice(0, 5);

        // Focus sessions
        const allFocusSessions = this.storageManager.getFocusSessions();
        const weekFocus = allFocusSessions.filter(s => s.startTime >= weekStart.getTime());
        const avgFlowScore = weekFocus.length > 0
            ? weekFocus.reduce((s, f) => s + f.flowScore, 0) / weekFocus.length
            : 0;

        // Context switch rate
        const totalSwitches = last7.reduce((s, d) => s + d.contextSwitches, 0);
        const contextSwitchRate = totalActive > 0 ? (totalSwitches / (totalActive / 3600)) : 0;

        // Most productive hour
        const hourlyTotals = new Array(24).fill(0);
        for (const day of last7) {
            for (let h = 0; h < 24; h++) {
                hourlyTotals[h] += day.hourlyActivity[h] ?? 0;
            }
        }
        const mostProductiveHour = hourlyTotals.indexOf(Math.max(...hourlyTotals));

        const insights = this.computeInsights(last7);

        return {
            weekStart: weekStart.toISOString().slice(0, 10),
            weekEnd: now.toISOString().slice(0, 10),
            totalActiveSeconds: totalActive,
            dailyBreakdown,
            topProjects,
            topLanguages,
            intentBreakdown: intentMap,
            totalFocusSessions: weekFocus.length,
            avgFocusScore: Math.round(avgFlowScore * 10) / 10,
            contextSwitchRate: Math.round(contextSwitchRate * 10) / 10,
            mostProductiveHour,
            insights
        };
    }

    public getQuickStats(): { label: string; value: string; icon: string }[] {
        const today = this.storageManager.getTodayStats();
        const last7 = this.storageManager.getLastNDays(7);
        const weekTotal = last7.reduce((s, d) => s + d.totalActiveSeconds, 0);

        const topIntent = this.getTopIntent(today.intentBreakdown);
        const topLang = this.getTopKey(today.languageBreakdown);
        const topProject = this.getTopKey(today.projectBreakdown);

        return [
            { icon: '$(clock)', label: 'Today', value: this.formatDuration(today.totalActiveSeconds) },
            { icon: '$(calendar)', label: 'This Week', value: this.formatDuration(weekTotal) },
            { icon: '$(symbol-misc)', label: 'Top Activity', value: topIntent },
            { icon: '$(code)', label: 'Top Language', value: topLang || 'N/A' },
            { icon: '$(folder)', label: 'Top Project', value: topProject || 'N/A' },
            { icon: '$(arrow-swap)', label: 'Context Switches', value: String(today.contextSwitches) },
            { icon: '$(eye)', label: 'Longest Focus', value: this.formatDuration(today.longestFocusSeconds) },
            { icon: '$(flame)', label: 'Peak Hour', value: today.peakHour >= 0 ? `${today.peakHour}:00` : 'N/A' }
        ];
    }

    public formatDuration(seconds: number): string {
        if (seconds < 60) { return `${Math.round(seconds)}s`; }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h === 0) { return `${m}m`; }
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    private computeInsights(days: DailyStats[]): AIInsight {
        const totalActive = days.reduce((s, d) => s + d.totalActiveSeconds, 0);
        const avgDaily = days.length > 0 ? totalActive / days.length : 0;

        // Hourly totals
        const hourlyTotals = new Array(24).fill(0);
        for (const day of days) {
            for (let h = 0; h < 24; h++) {
                hourlyTotals[h] += day.hourlyActivity[h] ?? 0;
            }
        }
        const peakHour = hourlyTotals.indexOf(Math.max(...hourlyTotals));
        const secondPeakHour = hourlyTotals.indexOf(
            Math.max(...hourlyTotals.map((v, i) => i === peakHour ? 0 : v))
        );

        // Intent breakdown
        const intentTotals: Record<WorkIntent, number> = { creating: 0, debugging: 0, refactoring: 0, exploring: 0, idle: 0, unknown: 0 };
        for (const day of days) {
            for (const [k, v] of Object.entries(day.intentBreakdown)) {
                intentTotals[k as WorkIntent] += v;
            }
        }

        // Context switch analysis
        const totalSwitches = days.reduce((s, d) => s + d.contextSwitches, 0);
        const switchRate = totalActive > 0 ? (totalSwitches / (totalActive / 3600)) : 0;

        // Productivity score (0-100)
        const focusRatio = totalActive > 0 ? (intentTotals.creating + intentTotals.debugging) / totalActive : 0;
        const productivityScore = Math.min(100, Math.round(
            focusRatio * 60 +
            (switchRate < 5 ? 20 : switchRate < 10 ? 10 : 0) +
            (avgDaily > 14400 ? 20 : avgDaily > 7200 ? 10 : 5)
        ));

        // Focus score
        const avgLongestFocus = days.reduce((s, d) => s + d.longestFocusSeconds, 0) / Math.max(days.length, 1);
        const focusScore = Math.min(10, Math.round(avgLongestFocus / 1800));

        // Build tips
        const tips: string[] = [];
        if (switchRate > 10) {
            tips.push(`You switch context ~${Math.round(switchRate)} times/hour. Try time-blocking to reduce cognitive overhead.`);
        }
        if (intentTotals.debugging > intentTotals.creating) {
            tips.push('More time spent debugging than creating. Consider writing more tests to catch issues earlier.');
        }
        if (avgLongestFocus < 1800) {
            tips.push('Your average focus session is under 30 minutes. Try the Pomodoro technique for deeper work.');
        }
        if (focusRatio < 0.4) {
            tips.push('Less than 40% of your time is spent in active creation/debugging. Identify and reduce distractions.');
        }
        if (intentTotals.refactoring > intentTotals.creating * 0.5) {
            tips.push('High refactoring ratio detected. Good code hygiene, but ensure you are also shipping new features.');
        }
        if (tips.length === 0) {
            tips.push('Great work! Keep maintaining your productive coding habits.');
            tips.push(`Your peak performance window (${peakHour}:00–${(peakHour + 2) % 24}:00) is ideal for complex tasks.`);
        }

        const creatingPct = totalActive > 0 ? Math.round((intentTotals.creating / totalActive) * 100) : 0;
        const debuggingPct = totalActive > 0 ? Math.round((intentTotals.debugging / totalActive) * 100) : 0;
        const refactoringPct = totalActive > 0 ? Math.round((intentTotals.refactoring / totalActive) * 100) : 0;
        const exploringPct = totalActive > 0 ? Math.round((intentTotals.exploring / totalActive) * 100) : 0;

        const contextSwitchWarning = switchRate > 8
            ? `You lose ~${Math.round(switchRate * 5)}% productivity to context switching. Consider batching similar tasks.`
            : undefined;

        return {
            headline: productivityScore >= 70
                ? `Strong week! Productivity score: ${productivityScore}/100`
                : `Productivity score: ${productivityScore}/100 — here's how to improve`,
            summary: `Over the past 7 days: ${creatingPct}% building, ${debuggingPct}% debugging, ${refactoringPct}% refactoring, ${exploringPct}% exploring. Peak hours: ${peakHour}:00–${(peakHour + 2) % 24}:00.`,
            tips,
            peakHours: `${peakHour}:00–${(peakHour + 2) % 24}:00 and ${secondPeakHour}:00–${(secondPeakHour + 1) % 24}:00`,
            contextSwitchWarning,
            focusScore,
            productivityScore,
            generatedAt: Date.now()
        };
    }

    private getTopIntent(breakdown: Record<WorkIntent, number>): string {
        let top: WorkIntent = 'unknown';
        let max = 0;
        for (const [k, v] of Object.entries(breakdown)) {
            if (v > max) { max = v; top = k as WorkIntent; }
        }
        const labels: Record<WorkIntent, string> = {
            creating: 'Creating',
            debugging: 'Debugging',
            refactoring: 'Refactoring',
            exploring: 'Exploring',
            idle: 'Idle',
            unknown: 'Mixed'
        };
        return labels[top];
    }

    private getTopKey(map: Record<string, number>): string {
        let top = '';
        let max = 0;
        for (const [k, v] of Object.entries(map)) {
            if (v > max) { max = v; top = k; }
        }
        return top;
    }

    private defaultInsight(): AIInsight {
        return {
            headline: 'Start coding to generate insights!',
            summary: 'DevPulse will analyze your activity as you code.',
            tips: ['Open a project and start coding to see personalized insights.'],
            peakHours: 'N/A',
            focusScore: 0,
            productivityScore: 0,
            generatedAt: Date.now()
        };
    }
}
