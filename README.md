# DevPulse — Developer Productivity Insights

> A VS Code extension that tracks not just **time**, but **output, focus, and productivity patterns**.

[![Version](https://img.shields.io/badge/version-1.10.0-blue.svg)](https://github.com/apertacodex/devpulse)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 🚀 Overview

**DevPulse** automatically tracks your coding activity and transforms it into meaningful productivity insights — going far beyond simple time tracking.

Instead of just telling you *"you coded 5 hours"*, DevPulse tells you:
> *"3h building features, 1.5h debugging, 30m reading code — and you work best between 10–12 AM."*

---

## ✨ Features

### ⏱ Automatic Time Tracking
- Tracks coding activity in real time — no manual timers
- Detects active coding vs idle time
- Tracks time per file, language, and project
- Runs silently in the background with minimal overhead

### 🧠 Work Intent Detection
| Intent | Description |
|---|---|
| **Creating** | Writing new code (more additions than deletions) |
| **Debugging** | Balanced edits, fixing issues |
| **Refactoring** | Heavy deletions and rewrites |
| **Exploring** | Reading and navigating code |

### 🎯 Focus Session Management
- Start timed focus sessions with a goal description
- Track context switches and files worked on during the session
- Automatic flow score calculation (0–10)
- Goal completion notifications
- Historical session log with scores

### 🔀 Context Switching Detection
- Counts file/project switches throughout the day
- Optional notification when excessive switching is detected
- Per-hour context switch rate in weekly reports

### 📊 Interactive Dashboard
- **Today Tab**: Hourly heatmap, work breakdown, language stats
- **Weekly Tab**: 7-day trend, top projects, top languages
- **AI Insights Tab**: Productivity score, coaching tips, peak hours
- **Focus Tab**: Active session controls, recent session history

### 🤖 AI Coaching
- Productivity score (0–100) based on your patterns
- Focus score (0–10) based on session depth
- Personalized recommendations generated from your data
- Peak hour identification
- Context switching warnings

### 🔒 Privacy-First
- All data stored locally using VS Code's built-in global state
- No API keys, no cloud sync, no external requests
- Configurable data retention (7–365 days)
- Full data export to JSON
- One-click data deletion

---

## 📦 Installation

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install apertacodex.devpulse`
4. Press Enter

Or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=apertacodex.devpulse).

---

## 🎮 Usage

### Sidebar Panel
Click the **DevPulse icon** (pulse wave) in the Activity Bar to open the sidebar with four views:
- **Today's Activity** — live stats for the current day
- **Insights & Coaching** — AI-generated tips and quick stats
- **Projects & Languages** — breakdown by project and language
- **Focus & Flow** — manage and review focus sessions

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+Alt+F` / `Cmd+Alt+F` | Start/Stop Focus Session |
| `Ctrl+Alt+D` / `Cmd+Alt+D` | Open Dashboard |
| `Ctrl+Alt+R` / `Cmd+Alt+R` | Show Weekly Report |

### Command Palette
All commands are available via `Ctrl+Shift+P`:
- `DevPulse: Open Dashboard`
- `DevPulse: Start Focus Session`
- `DevPulse: Show Weekly Report`
- `DevPulse: Generate AI Insights`
- `DevPulse: Toggle Tracking On/Off`
- `DevPulse: Export Data as JSON`
- `DevPulse: Clear All Tracking Data`

---

## ⚙️ Configuration

| Setting | Default | Description |
|---|---|---|
| `devpulse.enabled` | `true` | Enable/disable tracking |
| `devpulse.idleThresholdMinutes` | `5` | Minutes before session is idle |
| `devpulse.focusSessionGoalMinutes` | `90` | Default focus session duration |
| `devpulse.contextSwitchThresholdSeconds` | `30` | Seconds before a file change counts as a switch |
| `devpulse.showStatusBar` | `true` | Show time in status bar |
| `devpulse.statusBarFormat` | `time+intent` | Status bar display: `time`, `time+intent`, `focus` |
| `devpulse.privacyMode` | `true` | Local-only storage |
| `devpulse.dataRetentionDays` | `90` | Days to keep historical data |
| `devpulse.aiInsightsEnabled` | `true` | Enable AI coaching |
| `devpulse.notifyContextSwitching` | `false` | Alert on excessive context switching |
| `devpulse.workdayStartHour` | `9` | Workday start (for analysis) |
| `devpulse.workdayEndHour` | `18` | Workday end (for analysis) |
| `devpulse.excludePatterns` | `["**/node_modules/**", ...]` | Files to exclude from tracking |

---

## 🏗 Architecture

```
src/
├── extension.ts          # Activation, command registration
├── logger.ts             # Centralized output channel logging
├── types.ts              # Shared TypeScript interfaces
├── ActivityTracker.ts    # Core event-based tracking engine
├── InsightsEngine.ts     # Analytics, AI coaching, report generation
├── FocusSessionManager.ts # Focus session lifecycle
├── StorageManager.ts     # VS Code globalState persistence
├── StatusBarManager.ts   # Status bar items
├── DashboardPanel.ts     # Webview dashboard panel
├── TodayViewProvider.ts  # Today's activity tree view
├── InsightsViewProvider.ts # Insights tree view
├── ProjectsViewProvider.ts # Projects tree view
└── FocusViewProvider.ts  # Focus sessions tree view
```

---

## 🆚 Comparison

| Feature | WakaTime | DevPulse |
|---|---|---|
| Time tracking | ✅ | ✅ |
| Language stats | ✅ | ✅ |
| Work type detection | ❌ | ✅ |
| Focus sessions | ❌ | ✅ |
| Flow scoring | ❌ | ✅ |
| AI insights | ❌ | ✅ |
| Context switching detection | ❌ | ✅ |
| Privacy-first / local | ⚠️ | ✅ |
| No API key required | ❌ | ✅ |
| VS Code native UI | ❌ | ✅ |

---

## 🤝 Contributing

Pull requests are welcome! Please open an issue first to discuss major changes.

```bash
git clone https://github.com/apertacodex/devpulse.git
cd devpulse
npm install
npm run watch
# Press F5 in VS Code to launch Extension Development Host
```

---

## 📄 License

MIT © [apertacodex](https://github.com/apertacodex)
