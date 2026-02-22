import { beforeEach, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import { Readable } from "stream";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const mockRefs = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  s3Send: vi.fn(),
}));

vi.mock("../../../../services/storage.service.js", () => ({
  downloadFile: mockRefs.downloadFile,
}));

vi.mock("../../../../services/storage/config.js", () => ({
  BUCKET_NAME: "test-bucket",
  s3Client: {
    send: mockRefs.s3Send,
  },
}));

async function loadReaders() {
  return await import("../../../../services/sandbox/read/s3.readers.js");
}

describe("s3.readers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mocked(ListObjectsV2Command).mockClear();
  });

  it("reads source snapshot without using gunzipSync", async () => {
    const snapshotPayload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      fileCount: 1,
      files: {
        "src/index.ts": "console.log('ok');",
      },
    };
    const gzipped = zlib.gzipSync(JSON.stringify(snapshotPayload));
    const gunzipSyncSpy = vi.spyOn(zlib, "gunzipSync");

    mockRefs.downloadFile.mockImplementation(async (key: string) => {
      if (key.endsWith("source_snapshot.json.gz")) {
        return Readable.from([gzipped]);
      }
      return null;
    });

    const { readProjectFilesFromS3 } = await loadReaders();
    const files = await readProjectFilesFromS3("user-1", "chat-1");

    expect(files.get("src/index.ts")).toBe("console.log('ok');");
    expect(gunzipSyncSpy).not.toHaveBeenCalled();
  });

  it("paginates legacy sources list and reads files from every page", async () => {
    mockRefs.downloadFile.mockImplementation(async (key: string) => {
      if (key.endsWith("source_snapshot.json.gz")) {
        return null;
      }
      if (key.endsWith("source_backup.tar.gz")) {
        return null;
      }
      if (key.endsWith("sources/src/first.ts")) {
        return Readable.from(["first file"]);
      }
      if (key.endsWith("sources/src/second.ts")) {
        return Readable.from(["second file"]);
      }
      return null;
    });

    mockRefs.s3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: "user-1/chat-1/sources/src/first.ts" }],
        IsTruncated: true,
        NextContinuationToken: "next-page",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "user-1/chat-1/sources/src/second.ts" }],
        IsTruncated: false,
      });

    const { readProjectFilesFromS3 } = await loadReaders();
    const files = await readProjectFilesFromS3("user-1", "chat-1");

    expect(files.get("src/first.ts")).toBe("first file");
    expect(files.get("src/second.ts")).toBe("second file");
    expect(mockRefs.s3Send).toHaveBeenCalledTimes(2);

    const listCommandMock = vi.mocked(ListObjectsV2Command);
    expect(listCommandMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        Prefix: "user-1/chat-1/sources/",
        ContinuationToken: undefined,
      }),
    );
    expect(listCommandMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        Prefix: "user-1/chat-1/sources/",
        ContinuationToken: "next-page",
      }),
    );
  });
});
