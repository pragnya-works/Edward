import { useState, useCallback, useRef, useEffect } from "react";
import {
  AttachmentUploadStatus,
  type AttachedFile,
} from "./promptbar.constants";
import { IMAGE_UPLOAD_CONFIG } from "@edward/shared/constants";

export function useFileAttachments(
  isAuthenticated: boolean,
  supportsVision: boolean,
  onImageUpload?: (
    file: File,
  ) => Promise<{ url: string; mimeType: string; sizeBytes?: number }>,
) {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const filesRef = useRef(attachedFiles);

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

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!isAuthenticated || !supportsVision) return;
      if (!files || files.length === 0) return;

      const validFiles = Array.from(files).filter((file) => {
        if (
          !(
            IMAGE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES as readonly string[]
          ).includes(file.type)
        ) {
          console.warn(`File type ${file.type} not supported`);
          return false;
        }
        if (file.size > IMAGE_UPLOAD_CONFIG.MAX_SIZE_BYTES) {
          console.warn(
            `File ${file.name} exceeds ${IMAGE_UPLOAD_CONFIG.MAX_SIZE_MB}MB limit`,
          );
          return false;
        }
        return true;
      });

      const remainingSlots =
        IMAGE_UPLOAD_CONFIG.MAX_FILES - attachedFiles.length;
      const filesToAdd = validFiles.slice(0, remainingSlots);

      const newFiles: AttachedFile[] = filesToAdd.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        file,
        preview: URL.createObjectURL(file),
        status: AttachmentUploadStatus.UPLOADING,
      }));

      setAttachedFiles((prev) => [...prev, ...newFiles]);

      await Promise.all(
        newFiles.map(async (attachedFile) => {
          if (!onImageUpload) {
            setAttachedFiles((prev) =>
              prev.map((item) =>
                item.id === attachedFile.id
                  ? {
                      ...item,
                      status: AttachmentUploadStatus.FAILED,
                      error: "Image upload is not configured.",
                    }
                  : item,
              ),
            );
            return;
          }

          try {
            const uploaded = await onImageUpload(attachedFile.file);
            setAttachedFiles((prev) =>
              prev.map((item) =>
                item.id === attachedFile.id
                  ? {
                      ...item,
                      status: AttachmentUploadStatus.UPLOADED,
                      cdnUrl: uploaded.url,
                      mimeType: uploaded.mimeType,
                      error: undefined,
                    }
                  : item,
              ),
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Upload failed";
            setAttachedFiles((prev) =>
              prev.map((item) =>
                item.id === attachedFile.id
                  ? {
                      ...item,
                      status: AttachmentUploadStatus.FAILED,
                      error: errorMessage,
                    }
                  : item,
              ),
            );
          }
        }),
      );
    },
    [attachedFiles.length, isAuthenticated, supportsVision, onImageUpload],
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
      if (!isAuthenticated || !supportsVision) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    },
    [isAuthenticated, supportsVision],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleAttachmentClick = useCallback(() => {
    if (!isAuthenticated || !supportsVision) return;
    fileInputRef.current?.click();
  }, [isAuthenticated, supportsVision]);

  const canAttachMore =
    isAuthenticated &&
    supportsVision &&
    attachedFiles.length < IMAGE_UPLOAD_CONFIG.MAX_FILES;

  return {
    attachedFiles,
    isDragging,
    fileInputRef,
    canAttachMore,
    handleFiles,
    handleFileInputChange,
    handleClearAllFiles,
    handleRemoveFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleAttachmentClick,
  };
}
