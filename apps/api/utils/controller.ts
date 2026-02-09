import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { HttpStatus, ERROR_MESSAGES } from "./constants.js";
import { sendError } from "./response.js";
import { ensureError } from "./error.js";
import { createLogger } from "./logger.js";

const logger = createLogger("Controller");

export type ControllerFunction = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => Promise<void> | void;

export function asyncHandler(fn: ControllerFunction): ControllerFunction {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await fn(req, res, next);
    } catch (error) {
      const err = ensureError(error);
      logger.error(
        { error: err, path: req.path, method: req.method },
        "Controller error",
      );

      if (!res.headersSent) {
        sendError(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    }
  };
}

export function asyncHandlerWithCustomError(
  fn: ControllerFunction,
  errorMapper?: (error: Error) => { status: HttpStatus; message: string },
): ControllerFunction {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await fn(req, res, next);
    } catch (error) {
      const err = ensureError(error);

      if (errorMapper) {
        const { status, message } = errorMapper(err);
        if (!res.headersSent) {
          sendError(res, status, message);
        }
        return;
      }

      logger.error(
        { error: err, path: req.path, method: req.method },
        "Controller error",
      );

      if (!res.headersSent) {
        sendError(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        );
      }
    }
  };
}
