import { CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { logger } from "../../utils/logger.js";
import { config } from "../../app.config.js";
import { getCloudFrontClient } from "./cloudfront.config.js";

const DISTRIBUTION_ID = config.aws.cloudfrontDistributionId;

async function invalidateCloudFrontPaths(paths: string[]): Promise<void> {
  const client = await getCloudFrontClient();
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
    logger.info(
      { paths, distributionId: DISTRIBUTION_ID },
      "CloudFront invalidation created",
    );
  } catch (error) {
    logger.warn({ error, paths }, "CloudFront invalidation failed (non-fatal)");
  }
}

export async function invalidatePreviewCache(
  userId: string,
  chatId: string,
): Promise<void> {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_.]/g, "_");
  const prefix = `/${sanitize(userId)}/${sanitize(chatId)}/preview/*`;
  await invalidateCloudFrontPaths([prefix]);
}
