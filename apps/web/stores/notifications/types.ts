import { BuildRecordStatus } from "@edward/shared/api/contracts";

export interface NotificationSubscription {
  chatId: string;
  chatTitle: string;
  subscribedAt: number;
}

export interface BuildNotificationCheckpoint {
  buildId: string | null;
  status: BuildRecordStatus;
  updatedAt: number;
}

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

export interface NotificationsState {
  subscriptions: Record<string, NotificationSubscription>;
  buildCheckpoints: Record<string, BuildNotificationCheckpoint>;
  browserPermission: BrowserNotificationPermission;
  hasHydrated: boolean;
}

export interface NotificationsActions {
  subscribe: (chatId: string, chatTitle: string) => void;
  unsubscribe: (chatId: string) => void;
  isSubscribed: (chatId: string) => boolean;
  getSubscription: (chatId: string) => NotificationSubscription | undefined;
  getAllSubscriptions: () => NotificationSubscription[];
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
