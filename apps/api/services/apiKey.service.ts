import { db, user, eq } from '@workspace/auth';
import { decrypt } from '../utils/encryption.js';

export async function getUserWithApiKey(userId: string) {
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
}

export async function getDecryptedApiKey(userId: string): Promise<string> {
    const userData = await getUserWithApiKey(userId);

    if (!userData?.apiKey) {
        throw new Error('API key not found');
    }

    return decrypt(userData.apiKey);
}
