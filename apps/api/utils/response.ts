import { Response } from 'express';
import { HttpStatus } from './constants.js';

export function sendError(res: Response, status: HttpStatus, error: string): void {
    res.status(status).json({
        error,
        timestamp: new Date().toISOString(),
    });
}

export function sendSuccess<T>(res: Response, status: HttpStatus, message: string, data?: T): void {
    res.status(status).json({
        message,
        data,
        timestamp: new Date().toISOString(),
    });
}
