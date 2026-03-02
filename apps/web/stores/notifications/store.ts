"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BrowserNotificationPermission,
  NotificationsStore,
  NotificationsState,
  NotificationSubscription,
} from "./types";
import {
  MAX_SUBSCRIPTIONS,
  STALE_SUBSCRIPTION_AGE_MS,
} from "./types";

interface PersistedNotificationsState {
  ownerUserId?: string | null;
  subscriptions?: NotificationsState["subscriptions"];
  buildCheckpoints?: NotificationsState["buildCheckpoints"];
  browserPermission?: BrowserNotificationPermission;
}

function resolveInitialBrowserPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function filterOwnedSubscriptions(
  subscriptions: Record<string, NotificationSubscription>,
  userId: string,
): Record<string, NotificationSubscription> {
  const result: Record<string, NotificationSubscription> = {};
  for (const [chatId, sub] of Object.entries(subscriptions)) {
    if (sub.userId === userId) {
      result[chatId] = sub;
    }
  }
  return result;
}

function pruneSubscriptionsMap(
  subscriptions: Record<string, NotificationSubscription>,
): Record<string, NotificationSubscription> {
  const now = Date.now();
  const staleThreshold = now - STALE_SUBSCRIPTION_AGE_MS;
  const fresh: [string, NotificationSubscription][] = [];
  for (const [chatId, sub] of Object.entries(subscriptions)) {
    if (sub.subscribedAt >= staleThreshold) {
      fresh.push([chatId, sub]);
    }
  }

  if (fresh.length <= MAX_SUBSCRIPTIONS) {
    return fresh.length === Object.keys(subscriptions).length
      ? subscriptions
      : Object.fromEntries(fresh);
  }

  fresh.sort((a, b) => b[1].subscribedAt - a[1].subscribedAt);
  return Object.fromEntries(fresh.slice(0, MAX_SUBSCRIPTIONS));
}

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set, get) => ({
      ownerUserId: null,
      subscriptions: {},
      buildCheckpoints: {},
      browserPermission: resolveInitialBrowserPermission(),
      hasHydrated: false,

      setOwnerUserId: (userId) => {
        const prev = get().ownerUserId;
        if (prev === userId) {
          return;
        }
        if (userId) {
          set((state) => ({
            ownerUserId: userId,
            subscriptions: filterOwnedSubscriptions(state.subscriptions, userId),
            buildCheckpoints: {},
          }));
        } else {
          set({
            ownerUserId: null,
            subscriptions: {},
            buildCheckpoints: {},
          });
        }
      },

      subscribe: (chatId, chatTitle) => {
        const ownerId = get().ownerUserId;
        if (!ownerId) {
          return;
        }
        set((state) => {
          const next = {
            ...state.subscriptions,
            [chatId]: {
              chatId,
              chatTitle,
              subscribedAt: Date.now(),
              userId: ownerId,
            },
          };
          const subscriptions = pruneSubscriptionsMap(next);
          const buildCheckpoints: typeof state.buildCheckpoints = {};
          for (const [id, cp] of Object.entries(state.buildCheckpoints)) {
            if (subscriptions[id]) {
              buildCheckpoints[id] = cp;
            }
          }
          return { subscriptions, buildCheckpoints };
        });
      },

      updateSubscriptionTitle: (chatId, title) => {
        const ownerId = get().ownerUserId;
        if (!ownerId) return;
        set((state) => {
          const sub = state.subscriptions[chatId];
          if (!sub || sub.userId !== ownerId) return state;
          return {
            subscriptions: {
              ...state.subscriptions,
              [chatId]: { ...sub, chatTitle: title },
            },
          };
        });
      },

      unsubscribe: (chatId) =>
        set((state) => {
          const subscriptions = { ...state.subscriptions };
          const buildCheckpoints = { ...state.buildCheckpoints };
          delete subscriptions[chatId];
          delete buildCheckpoints[chatId];
          return { subscriptions, buildCheckpoints };
        }),

      isSubscribed: (chatId) => {
        const sub = get().subscriptions[chatId];
        if (!sub) return false;
        const ownerId = get().ownerUserId;
        return ownerId ? sub.userId === ownerId : false;
      },

      getSubscription: (chatId) => {
        const sub = get().subscriptions[chatId];
        if (!sub) return undefined;
        const ownerId = get().ownerUserId;
        return ownerId && sub.userId === ownerId ? sub : undefined;
      },

      getAllSubscriptions: () => {
        const ownerId = get().ownerUserId;
        if (!ownerId) return [];
        return Object.values(get().subscriptions).filter(
          (sub) => sub.userId === ownerId,
        );
      },

      purgeSubscriptionsNotOwnedBy: (userId) =>
        set((state) => ({
          subscriptions: filterOwnedSubscriptions(state.subscriptions, userId),
          buildCheckpoints: {},
        })),

      pruneStaleSubscriptions: () =>
        set((state) => {
          const subscriptions = pruneSubscriptionsMap(state.subscriptions);
          const buildCheckpoints: typeof state.buildCheckpoints = {};
          for (const [chatId, cp] of Object.entries(state.buildCheckpoints)) {
            if (subscriptions[chatId]) {
              buildCheckpoints[chatId] = cp;
            }
          }
          return { subscriptions, buildCheckpoints };
        }),

      setBuildCheckpoint: (chatId, checkpoint) =>
        set((state) => ({
          buildCheckpoints: {
            ...state.buildCheckpoints,
            [chatId]: checkpoint,
          },
        })),

      getBuildCheckpoint: (chatId) => get().buildCheckpoints[chatId],

      clearBuildCheckpoint: (chatId) =>
        set((state) => {
          const buildCheckpoints = { ...state.buildCheckpoints };
          delete buildCheckpoints[chatId];
          return { buildCheckpoints };
        }),

      setBrowserPermission: (browserPermission) => set({ browserPermission }),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "edward-notification-subscriptions",
      version: 3,
      partialize: (state) => ({
        ownerUserId: state.ownerUserId,
        subscriptions: state.subscriptions,
        buildCheckpoints: state.buildCheckpoints,
        browserPermission: state.browserPermission,
      }),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== "object") {
          return {
            ownerUserId: null,
            subscriptions: {},
            buildCheckpoints: {},
            browserPermission: resolveInitialBrowserPermission(),
          } satisfies PersistedNotificationsState;
        }

        const typed = persistedState as PersistedNotificationsState;

        if (version < 3) {
          return {
            ownerUserId: null,
            subscriptions: {},
            buildCheckpoints: {},
            browserPermission:
              typed.browserPermission ?? resolveInitialBrowserPermission(),
          } satisfies PersistedNotificationsState;
        }

        return {
          ownerUserId: typed.ownerUserId ?? null,
          subscriptions: typed.subscriptions ?? {},
          buildCheckpoints: typed.buildCheckpoints ?? {},
          browserPermission:
            typed.browserPermission ?? resolveInitialBrowserPermission(),
        } satisfies PersistedNotificationsState;
      },
      onRehydrateStorage: () => (state) => {
        state?.pruneStaleSubscriptions();
        state?.setHasHydrated(true);
      },
    },
  ),
);
