import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { db } from "@edward/auth";
import {
  getUserWithApiKey,
  getDecryptedApiKey,
} from "../../services/apiKey.service.js";
import * as encryption from "../../utils/encryption.js";

interface MockedDb {
  select: Mocked<() => MockedDb>;
  from: Mocked<() => MockedDb>;
  where: Mocked<() => MockedDb>;
  limit: Mocked<(n: number) => Promise<unknown[]>>;
}

vi.mock("@edward/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@edward/auth")>("@edward/auth");
  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    },
    user: {},
    eq: vi.fn(),
  };
});

vi.mock("../../utils/encryption.js", () => ({
  decrypt: vi.fn(),
}));

describe("apiKey service", () => {
  const mockUserId = "user-123";
  const mockEncryptedKey = "encrypted-key-data";
  const mockDecryptedKey = "sk-proj-valid-api-key";
  const mockedDb = db as unknown as MockedDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserWithApiKey", () => {
    it("should return user data with encrypted API key", async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: mockEncryptedKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockedDb.limit).mockResolvedValue([mockUserData]);

      const result = await getUserWithApiKey(mockUserId);

      expect(result).toEqual(mockUserData);
    });

    it("should return undefined when user not found", async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([]);

      const result = await getUserWithApiKey(mockUserId);

      expect(result).toBeUndefined();
    });

    it("should return user with null apiKey when key not set", async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockedDb.limit).mockResolvedValue([mockUserData]);

      const result = await getUserWithApiKey(mockUserId);

      expect(result?.apiKey).toBeNull();
    });

    it("should throw error when database query fails", async () => {
      vi.mocked(mockedDb.limit).mockRejectedValue(new Error("DB error"));

      await expect(getUserWithApiKey(mockUserId)).rejects.toThrow(
        "Failed to retrieve user API key: DB error",
      );
    });
  });

  describe("getDecryptedApiKey", () => {
    it("should return decrypted API key", async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: mockEncryptedKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockedDb.limit).mockResolvedValue([mockUserData]);
      vi.mocked(encryption.decrypt).mockReturnValue(mockDecryptedKey);

      const result = await getDecryptedApiKey(mockUserId);

      expect(result).toBe(mockDecryptedKey);
      expect(encryption.decrypt).toHaveBeenCalledWith(mockEncryptedKey);
    });

    it("should throw error when user not found", async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([]);

      await expect(getDecryptedApiKey(mockUserId)).rejects.toThrow(
        "API key configuration not found for this user.",
      );
    });

    it("should throw error when API key is null", async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockedDb.limit).mockResolvedValue([mockUserData]);

      await expect(getDecryptedApiKey(mockUserId)).rejects.toThrow(
        "API key configuration not found for this user.",
      );
    });

    it("should throw error when API key is empty string", async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockedDb.limit).mockResolvedValue([mockUserData]);

      await expect(getDecryptedApiKey(mockUserId)).rejects.toThrow(
        "API key configuration not found for this user.",
      );
    });

    it("should propagate decryption errors", async () => {
      const mockUserData = {
        id: mockUserId,
        apiKey: mockEncryptedKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(mockedDb.limit).mockResolvedValue([mockUserData]);
      vi.mocked(encryption.decrypt).mockImplementation(() => {
        throw new Error("Decryption failed");
      });

      await expect(getDecryptedApiKey(mockUserId)).rejects.toThrow(
        "Decryption failed",
      );
    });
  });
});
