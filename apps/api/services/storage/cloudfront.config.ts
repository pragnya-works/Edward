import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { config } from "../../app.config.js";
import { REGION, awsClientConfig } from "./storage.config.js";

const ASSUME_ROLE_DURATION_SECONDS = 3600;
const REFRESH_BUFFER_MS = 60_000;
const DEFAULT_ROLE_SESSION_PREFIX = "edward-cloudfront";

let defaultClient: CloudFrontClient | null = null;
let assumedClientCache:
  | {
      roleArn: string;
      client: CloudFrontClient;
      expiresAt: number;
    }
  | null = null;
let assumedClientRefresh:
  | {
      roleArn: string;
      promise: Promise<{
        client: CloudFrontClient;
        expiresAt: number;
      }>;
    }
  | null = null;

function getCloudFrontRoleArn(): string | null {
  const roleArn = config.aws.cloudfrontRoleArn?.trim();
  return roleArn && roleArn.length > 0 ? roleArn : null;
}

function getRoleSessionName(): string {
  const configured = config.aws.cloudfrontRoleSessionName
    ?.trim()
    .replace(/[^a-zA-Z0-9+=,.@-]/g, "-");
  if (configured && configured.length > 0) {
    return configured.slice(0, 64);
  }

  return `${DEFAULT_ROLE_SESSION_PREFIX}-${Date.now()}`.slice(0, 64);
}

async function createAssumedClient(roleArn: string): Promise<{
  client: CloudFrontClient;
  expiresAt: number;
}> {
  const stsClient = new STSClient({
    region: REGION,
    ...(awsClientConfig.credentials
      ? { credentials: awsClientConfig.credentials }
      : {}),
  });

  const response = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: getRoleSessionName(),
      DurationSeconds: ASSUME_ROLE_DURATION_SECONDS,
    }),
  );

  const credentials = response.Credentials;
  if (
    !credentials?.AccessKeyId ||
    !credentials.SecretAccessKey ||
    !credentials.SessionToken ||
    !credentials.Expiration
  ) {
    throw new Error(
      "Failed to assume CloudFront role: temporary credentials are incomplete.",
    );
  }

  return {
    client: new CloudFrontClient({
      region: REGION,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      },
    }),
    expiresAt: credentials.Expiration.getTime(),
  };
}

export async function getCloudFrontClient(): Promise<CloudFrontClient | null> {
  const distributionId = config.aws.cloudfrontDistributionId?.trim();
  if (!distributionId) {
    return null;
  }

  const roleArn = getCloudFrontRoleArn();
  if (!roleArn) {
    if (!defaultClient) {
      defaultClient = new CloudFrontClient({
        region: REGION,
        ...(awsClientConfig.credentials
          ? { credentials: awsClientConfig.credentials }
          : {}),
      });
    }
    return defaultClient;
  }

  const now = Date.now();
  if (
    assumedClientCache &&
    assumedClientCache.roleArn === roleArn &&
    now < assumedClientCache.expiresAt - REFRESH_BUFFER_MS
  ) {
    return assumedClientCache.client;
  }

  if (!assumedClientRefresh || assumedClientRefresh.roleArn !== roleArn) {
    assumedClientRefresh = {
      roleArn,
      promise: createAssumedClient(roleArn),
    };
  }

  const refresh = assumedClientRefresh;
  try {
    const assumed = await refresh.promise;
    assumedClientCache = {
      roleArn,
      client: assumed.client,
      expiresAt: assumed.expiresAt,
    };
    return assumed.client;
  } finally {
    if (assumedClientRefresh === refresh) {
      assumedClientRefresh = null;
    }
  }
}
