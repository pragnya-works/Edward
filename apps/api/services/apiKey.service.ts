import { db, user, eq } from '@workspace/auth';
import { decrypt } from '../utils/encryption.js';

export async function getUserEncryptedKey(userId: string): Promise<{ id: string; apiKey: string | null; createdAt: Date; updatedAt: Date } | undefined> {
    try {
        const [result] = await db
            .select({
                id: user.id,
                apiKey: user.apiKey,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        return result;
    } catch (error) {
        throw new Error(`Failed to retrieve user API key: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export const getUserWithApiKey = getUserEncryptedKey;

export async function getDecryptedApiKey(userId: string): Promise<string> {
    const userData = await getUserEncryptedKey(userId);

    if (!userData || !userData.apiKey) {
        throw new Error('API key configuration not found for this user.');
    }

    return decrypt(userData.apiKey);
}
