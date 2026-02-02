export interface SandboxInstance {
    id: string;
    containerId: string;
    expiresAt: number;
    userId: string;
    chatId: string;
    scaffoldedFramework?: string;
    requestedPackages?: string[];
}

export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface FileInfo {
    path: string;
    size: number;
}

export interface BackupResult {
    totalFiles: number;
    successful: number;
    failed: number;
    errors: string[];
}

export interface S3File {
    Key: string;
    Size: number;
}