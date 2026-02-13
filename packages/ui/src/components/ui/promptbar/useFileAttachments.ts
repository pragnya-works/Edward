import { useState, useCallback, useRef, useEffect } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES,
  type AttachedFile,
} from "./promptbar.constants";

export function useFileAttachments(
  isAuthenticated: boolean,
  supportsVision: boolean,
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
    (files: FileList | null) => {
      if (!isAuthenticated || !supportsVision) return;
      if (!files || files.length === 0) return;

      const validFiles = Array.from(files).filter((file) => {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          console.warn(`File type ${file.type} not supported`);
          return false;
        }
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`File ${file.name} exceeds 10MB limit`);
          return false;
        }
        return true;
      });

      const remainingSlots = MAX_FILES - attachedFiles.length;
      const filesToAdd = validFiles.slice(0, remainingSlots);

      const newFiles: AttachedFile[] = filesToAdd.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
      }));

      setAttachedFiles((prev) => [...prev, ...newFiles]);
    },
    [attachedFiles.length, isAuthenticated, supportsVision],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
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
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleAttachmentClick = useCallback(() => {
    if (!isAuthenticated || !supportsVision) return;
    fileInputRef.current?.click();
  }, [isAuthenticated, supportsVision]);

  const canAttachMore =
    isAuthenticated && supportsVision && attachedFiles.length < MAX_FILES;

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
