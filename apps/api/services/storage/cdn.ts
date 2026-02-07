import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { logger } from '../../utils/logger.js';
import { REGION } from './config.js';

const DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;

let cfClient: CloudFrontClient | null = null;

function getCloudFrontClient(): CloudFrontClient | null {
    if (!DISTRIBUTION_ID) return null;
    if (!cfClient) {
        cfClient = new CloudFrontClient({ region: REGION });
    }
    return cfClient;
}

async function invalidateCloudFrontPaths(paths: string[]): Promise<void> {
    const client = getCloudFrontClient();
    if (!client || paths.length === 0) return;

    try {
        const command = new CreateInvalidationCommand({
            DistributionId: DISTRIBUTION_ID,
            InvalidationBatch: {
                CallerReference: `edward-${Date.now()}`,
                Paths: {
                    Quantity: paths.length,
                    Items: paths,
                },
            },
        });

        await client.send(command);
        logger.info({ paths, distributionId: DISTRIBUTION_ID }, 'CloudFront invalidation created');
    } catch (error) {
        logger.warn({ error, paths }, 'CloudFront invalidation failed (non-fatal)');
    }
}

export async function invalidatePreviewCache(userId: string, chatId: string): Promise<void> {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_.]/g, '_');
    const prefix = `/${sanitize(userId)}/${sanitize(chatId)}/preview/*`;
    await invalidateCloudFrontPaths([prefix]);
}
