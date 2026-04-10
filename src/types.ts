export type WorkIntent = 'creating' | 'debugging' | 'refactoring' | 'exploring' | 'idle' | 'unknown';

export interface ActivityEvent {
    timestamp: number;
    filePath: string;
    language: string;
    project: string;
    branch: string;
    intent: WorkIntent;
    linesAdded: number;
    linesDeleted: number;
    isActive: boolean;
}

export interface SessionRecord {
    id: string;
    startTime: number;
    endTime: number;
    durationSeconds: number;
    project: string;
    branch: string;
    language: string;
    intent: WorkIntent;
    filesEdited: string[];
    contextSwitches: number;
}

export interface FocusSession {
    id: string;
    goal: string;
    startTime: number;
    endTime?: number;
    durationMinutes: number;
    goalMinutes: number;
    flowScore: number;
    contextSwitches: number;
    interruptions: number;
    filesWorkedOn: string[];
    project: string;
}

export interface DailyStats {
    date: string; // YYYY-MM-DD
    totalActiveSeconds: number;
    totalIdleSeconds: number;
    intentBreakdown: Record<WorkIntent, number>;
    languageBreakdown: Record<string, number>;
    projectBreakdown: Record<string, number>;
    contextSwitches: number;
    longestFocusSeconds: number;
    peakHour: number;
    hourlyActivity: number[]; // 24 entries, seconds per hour
    focusSessions: FocusSession[];
    filesEdited: number;
}

export interface AIInsight {
    headline: string;
    summary: string;
    tips: string[];
    peakHours: string;
    contextSwitchWarning?: string;
    focusScore: number;
    productivityScore: number;
    generatedAt: number;
}

export interface ProjectStats {
    name: string;
    totalSeconds: number;
    lastActive: number;
    languages: Record<string, number>;
    branches: string[];
    intentBreakdown: Record<WorkIntent, number>;
}

export interface WeeklyReport {
    weekStart: string;
    weekEnd: string;
    totalActiveSeconds: number;
    dailyBreakdown: { date: string; seconds: number }[];
    topProjects: ProjectStats[];
    topLanguages: { language: string; seconds: number }[];
    intentBreakdown: Record<WorkIntent, number>;
    totalFocusSessions: number;
    avgFocusScore: number;
    contextSwitchRate: number;
    mostProductiveHour: number;
    insights: AIInsight;
}
