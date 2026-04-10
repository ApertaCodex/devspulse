import * as vscode from 'vscode';

export class Logger {
    private readonly outputChannel: vscode.OutputChannel;

    constructor(name: string) {
        this.outputChannel = vscode.window.createOutputChannel(name);
    }

    public info(message: string): void {
        this.log('INFO', message);
    }

    public warn(message: string): void {
        this.log('WARN', message);
    }

    public error(message: string, error?: unknown): void {
        this.log('ERROR', message);
        if (error instanceof Error) {
            this.log('ERROR', `  ${error.message}`);
            if (error.stack) {
                this.log('ERROR', error.stack);
            }
        } else if (error !== undefined) {
            this.log('ERROR', String(error));
        }
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }
}
