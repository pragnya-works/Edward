import { useState, useCallback, useRef, useEffect } from "react";
import {
  AttachmentUploadStatus,
  type AttachedFile,
} from "./promptbar.constants";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

const MAX_CONCURRENT_UPLOADS = 2;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface UploadQueueItem {
  id: string;
  file: File;
  retries: number;
}

interface UploadError extends Error {
  status?: number;
}

function getUploadErrorStatus(error: unknown): number | null {
  const status = (error as UploadError | null)?.status;
  return typeof status === "number" ? status : null;
}

function resolveUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Upload failed";
}

function shouldRetryUpload(status: number | null, retries: number): boolean {
  if (retries >= MAX_RETRIES) {
    return false;
  }

  if (status === 429) {
    return false;
  }

  if (status !== null && status >= 400 && status < 500) {
    return false;
  }

  return true;
}

export function useFileAttachments(
  isAuthenticated: boolean,
  supportsVision: boolean,
  isUploadBlocked: boolean,
  uploadBlockedReason: string | null,
  onImageUpload?: (
    file: File,
  ) => Promise<{ url: string; mimeType: string; sizeBytes?: number }>,
  onImageUploadError?: (message: string) => void,
) {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const filesRef = useRef(attachedFiles);
  const isAttachmentInteractionEnabled =
    isAuthenticated && supportsVision && !isUploadBlocked;

  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const activeUploadsRef = useRef(0);

  useEffect(() => {
    filesRef.current = attachedFiles;
  }, [attachedFiles]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => {
        URL.revokeObjectURL(file.preview);
      });
    };
  }, []);

  useEffect(() => {
    if (isAttachmentInteractionEnabled) {
      return;
    }
    setIsDragging(false);
    dragCounter.current = 0;
  }, [isAttachmentInteractionEnabled]);

  const markFilesFailed = useCallback((fileIds: string[], errorMessage: string) => {
    if (fileIds.length === 0) {
      return;
    }

    const failedSet = new Set(fileIds);
    setAttachedFiles((prev) =>
      prev.map((file) =>
        failedSet.has(file.id)
          ? {
            ...file,
            status: AttachmentUploadStatus.FAILED,
            error: errorMessage,
          }
          : file,
      ),
    );
  }, []);

  const processUploadQueue = useCallback(() => {
    if (!onImageUpload) return;

    while (
      activeUploadsRef.current < MAX_CONCURRENT_UPLOADS &&
      uploadQueueRef.current.length > 0
    ) {
      const item = uploadQueueRef.current.shift()!;
      activeUploadsRef.current++;

      const attemptUpload = async () => {
        try {
          const uploaded = await onImageUpload(item.file);
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? {
                  ...f,
                  status: AttachmentUploadStatus.UPLOADED,
                  cdnUrl: uploaded.url,
                  mimeType: uploaded.mimeType,
                  error: undefined,
                }
                : f,
            ),
          );
        } catch (error) {
          const status = getUploadErrorStatus(error);

          if (shouldRetryUpload(status, item.retries)) {
            item.retries++;
            setTimeout(() => {
              uploadQueueRef.current.push(item);
              processUploadQueue();
            }, RETRY_DELAY_MS * item.retries);
          } else {
            const errorMessage = resolveUploadErrorMessage(error);
            onImageUploadError?.(errorMessage);
            markFilesFailed([item.id], errorMessage);

            if (status === 429) {
              const queuedIds = uploadQueueRef.current.map((queued) => queued.id);
              uploadQueueRef.current = [];
              markFilesFailed(queuedIds, errorMessage);
            }
          }
        } finally {
          activeUploadsRef.current--;
          processUploadQueue();
        }
      };

      attemptUpload();
    }
  }, [markFilesFailed, onImageUpload, onImageUploadError]);

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!isAuthenticated) {
        onImageUploadError?.("Sign in to attach images.");
        return;
      }
      if (!supportsVision) {
        onImageUploadError?.("The selected model does not support image inputs.");
        return;
      }
      if (isUploadBlocked) {
        onImageUploadError?.(
          uploadBlockedReason || "Image uploads are currently unavailable.",
        );
        return;
      }
      if (!files || files.length === 0) return;

      const validFiles = Array.from(files).filter((file) => {
        if (
          !(
            IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES as readonly string[]
          ).includes(file.type)
        ) {
          const message = `Unsupported image type for ${file.name}`;
          onImageUploadError?.(message);
          return false;
        }
        if (file.size > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES) {
          const message = `${file.name} exceeds ${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB limit`;
          onImageUploadError?.(message);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      const remainingSlots =
        IMAGE_UPLOAD_CONFIG.MAX_FILES - attachedFiles.length;
      if (remainingSlots <= 0) {
        onImageUploadError?.(
          `You can attach up to ${IMAGE_UPLOAD_CONFIG.MAX_FILES} images.`,
        );
        return;
      }
      const filesToAdd = validFiles.slice(0, remainingSlots);
      if (validFiles.length > remainingSlots) {
        onImageUploadError?.(
          `Only ${remainingSlots} more image${remainingSlots === 1 ? "" : "s"} can be attached (max ${IMAGE_UPLOAD_CONFIG.MAX_FILES}).`,
        );
      }

      const newFiles: AttachedFile[] = filesToAdd.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        file,
        preview: URL.createObjectURL(file),
        status: AttachmentUploadStatus.UPLOADING,
      }));

      setAttachedFiles((prev) => [...prev, ...newFiles]);

      if (!onImageUpload) {
        setAttachedFiles((prev) =>
          prev.map((item) =>
            newFiles.some((f) => f.id === item.id)
              ? {
                ...item,
                status: AttachmentUploadStatus.FAILED,
                error: "Image upload is not configured.",
              }
              : item,
          ),
        );
        onImageUploadError?.("Image upload is not configured.");
        return;
      }

      for (const attachedFile of newFiles) {
        const queueItem: UploadQueueItem = {
          id: attachedFile.id,
          file: attachedFile.file,
          retries: 0,
        };

        uploadQueueRef.current.push(queueItem);
      }

      processUploadQueue();
    },
    [
      attachedFiles.length,
      isAuthenticated,
      supportsVision,
      isUploadBlocked,
      uploadBlockedReason,
      onImageUpload,
      onImageUploadError,
      processUploadQueue,
    ],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!isAttachmentInteractionEnabled) return;
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;

      e.preventDefault();
      void handleFiles(imageFiles);
    },
    [handleFiles, isAttachmentInteractionEnabled],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFiles],
  );

  const handleClearAllFiles = useCallback(() => {
    attachedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    setAttachedFiles([]);
  }, [attachedFiles]);

  const handleRemoveFile = useCallback((id: string) => {
    setAttachedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isAttachmentInteractionEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    },
    [isAttachmentInteractionEnabled],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!isAttachmentInteractionEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    },
    [isAttachmentInteractionEnabled],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isAttachmentInteractionEnabled) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [isAttachmentInteractionEnabled],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isAttachmentInteractionEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles, isAttachmentInteractionEnabled],
  );

  const handleAttachmentClick = useCallback(() => {
    if (!isAttachmentInteractionEnabled) return;
    fileInputRef.current?.click();
  }, [isAttachmentInteractionEnabled]);

  const canAttachMore =
    isAttachmentInteractionEnabled &&
    attachedFiles.length < IMAGE_UPLOAD_CONFIG.MAX_FILES;

  return {
    attachedFiles,
    isDragging,
    fileInputRef,
    canAttachMore,
    handleFileInputChange,
    handleClearAllFiles,
    handleRemoveFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleAttachmentClick,
    handlePaste,
  };
}
