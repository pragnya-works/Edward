"use client";

import { type ReactNode, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@edward/ui/components/button";
import { ErrorBoundary } from "react-error-boundary";

interface SandboxErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    if (error && typeof error === "object") {
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    return "An unexpected rendering or network error occurred.";
}

function isCancellationReason(reason: unknown): boolean {
    if (reason instanceof DOMException && reason.name === "AbortError") {
        return true;
    }

    if (!reason || typeof reason !== "object") {
        return false;
    }

    const record = reason as {
        type?: string;
        name?: string;
        msg?: string;
        message?: string;
    };

    const type = (record.type || record.name || "").toLowerCase();
    const text = (record.msg || record.message || getErrorMessage(reason)).toLowerCase();

    return (
        type.includes("cancelation") ||
        type.includes("cancellation") ||
        type.includes("abort") ||
        text.includes("operation is manually canceled") ||
        text.includes("operation is manually cancelled") ||
        text.includes("aborterror")
    );
}

function shouldSuppressUnhandledRejection(reason: unknown): boolean {
    return isCancellationReason(reason);
}

function isKnownNonFatalSandboxNoise(reason: unknown): boolean {
    const message = getErrorMessage(reason).toLowerCase();
    return (
        message.includes("resizeobserver loop limit exceeded") ||
        message.includes("resizeobserver loop completed with undelivered notifications")
    );
}

interface SandboxFallbackProps {
    error: unknown;
    resetErrorBoundary: () => void;
    fallback?: ReactNode;
}

function SandboxFallback({
    error,
    resetErrorBoundary,
    fallback,
}: SandboxFallbackProps) {
    if (fallback) {
        return fallback;
    }

    return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-workspace-bg text-workspace-foreground p-6 text-center">
            <div className="flex bg-destructive/10 p-4 rounded-full border border-destructive/20 mb-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-workspace-foreground">Sandbox Encountered an Error</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6 whitespace-pre-wrap">
                {getErrorMessage(error)}
            </p>
            <Button onClick={resetErrorBoundary} variant="secondary">
                Try Again
            </Button>
        </div>
    );
}

export function SandboxErrorBoundary({ children, fallback }: SandboxErrorBoundaryProps) {
    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (shouldSuppressUnhandledRejection(event.reason)) {
                if (
                    process.env.NODE_ENV !== "production" &&
                    !isCancellationReason(event.reason)
                ) {
                    console.warn(
                        "Sandbox suppressed non-fatal async error:",
                        getErrorMessage(event.reason),
                    );
                }
                event.preventDefault();
                return;
            }

            if (isKnownNonFatalSandboxNoise(event.reason)) {
                if (process.env.NODE_ENV !== "production") {
                    console.warn(
                        "Sandbox observed non-fatal async warning:",
                        getErrorMessage(event.reason),
                    );
                }
                return;
            }

            console.error("Sandbox unhandled promise rejection:", event.reason);
        };

        window.addEventListener("unhandledrejection", handleUnhandledRejection);
        return () => {
            window.removeEventListener("unhandledrejection", handleUnhandledRejection);
        };
    }, []);

    return (
        <ErrorBoundary
            fallbackRender={({ error, resetErrorBoundary }) => (
                <SandboxFallback
                    error={error}
                    resetErrorBoundary={resetErrorBoundary}
                    fallback={fallback}
                />
            )}
            onError={(error, errorInfo) => {
                console.error("Sandbox Error Boundary caught an error:", error, errorInfo);
            }}
        >
            {children}
        </ErrorBoundary>
    );
}
