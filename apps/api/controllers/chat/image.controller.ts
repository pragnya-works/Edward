import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getAuthenticatedUserId } from "../../middleware/auth.js";
import { uploadUserImageToCdn } from "../../services/storage/cdnAssets.service.js";
import { HttpStatus, ERROR_MESSAGES } from "../../utils/constants.js";
import { ensureError } from "../../utils/error.js";
import {
  validateImageBuffer,
  type AllowedImageMimeType,
} from "../../utils/imageValidation.js";
import { logger } from "../../utils/logger.js";
import { sendError as sendStandardError, sendSuccess } from "../../utils/response.js";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

const IMAGE_UPLOAD_CONTENT_TYPES = new Set(
  IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES,
);

export async function uploadChatImage(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);

    const contentTypeRaw = req.headers["content-type"];
    const contentType = Array.isArray(contentTypeRaw)
      ? contentTypeRaw[0]
      : contentTypeRaw;
    const mimeType = contentType?.split(";")[0]?.trim() as
      | AllowedImageMimeType
      | undefined;

    if (!mimeType || !IMAGE_UPLOAD_CONTENT_TYPES.has(mimeType)) {
      sendStandardError(
        res,
        HttpStatus.BAD_REQUEST,
        "Unsupported image type. Only JPEG, PNG, and WebP are allowed.",
      );
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.byteLength === 0) {
      sendStandardError(res, HttpStatus.BAD_REQUEST, "Image payload is empty.");
      return;
    }

    const validated = validateImageBuffer(body, mimeType);
    if (!validated.success) {
      sendStandardError(res, HttpStatus.BAD_REQUEST, validated.error.message);
      return;
    }

    const fileNameHeader = req.headers["x-file-name"];
    const rawFileName = Array.isArray(fileNameHeader)
      ? fileNameHeader[0]
      : fileNameHeader;
    let originalFileName: string | undefined;
    if (rawFileName) {
      try {
        originalFileName = decodeURIComponent(rawFileName);
      } catch {
        originalFileName = rawFileName;
      }
    }

    const uploaded = await uploadUserImageToCdn(
      userId,
      body,
      validated.data.mimeType,
      originalFileName,
    );

    sendSuccess(res, HttpStatus.CREATED, "Image uploaded successfully", {
      url: uploaded.url,
      key: uploaded.key,
      mimeType: validated.data.mimeType,
      sizeBytes: validated.data.sizeBytes,
    });
  } catch (error) {
    logger.error(ensureError(error), "uploadChatImage error");
    sendStandardError(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
}
