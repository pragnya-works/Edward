import { BuildRecordStatus } from "@edward/shared/api/contracts";

export const MAX_SUBSCRIPTIONS = 50;
export const STALE_SUBSCRIPTION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface NotificationSubscription {
  chatId: string;
  chatTitle: string;
  subscribedAt: number;
  userId: string;
}

export interface BuildNotificationCheckpoint {
  buildId: string | null;
  status: BuildRecordStatus;
  updatedAt: number;
}

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

export interface NotificationsState {
  ownerUserId: string | null;
  subscriptions: Record<string, NotificationSubscription>;
  buildCheckpoints: Record<string, BuildNotificationCheckpoint>;
  browserPermission: BrowserNotificationPermission;
  hasHydrated: boolean;
}

export interface NotificationsActions {
  setOwnerUserId: (userId: string | null) => void;
  subscribe: (chatId: string, chatTitle: string) => void;
  unsubscribe: (chatId: string) => void;
  updateSubscriptionTitle: (chatId: string, title: string) => void;
  isSubscribed: (chatId: string) => boolean;
  getSubscription: (chatId: string) => NotificationSubscription | undefined;
  getAllSubscriptions: () => NotificationSubscription[];
  purgeSubscriptionsNotOwnedBy: (userId: string) => void;
  pruneStaleSubscriptions: () => void;
  setBuildCheckpoint: (
    chatId: string,
    checkpoint: BuildNotificationCheckpoint,
  ) => void;
  getBuildCheckpoint: (chatId: string) => BuildNotificationCheckpoint | undefined;
  clearBuildCheckpoint: (chatId: string) => void;
  setBrowserPermission: (permission: BrowserNotificationPermission) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export type NotificationsStore = NotificationsState & NotificationsActions;
