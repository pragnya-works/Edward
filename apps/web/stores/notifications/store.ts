"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BrowserNotificationPermission,
  NotificationsStore,
  NotificationsState,
} from "./types";

interface PersistedNotificationsState {
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

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set, get) => ({
      subscriptions: {},
      buildCheckpoints: {},
      browserPermission: resolveInitialBrowserPermission(),
      hasHydrated: false,

      subscribe: (chatId, chatTitle) =>
        set((state) => ({
          subscriptions: {
            ...state.subscriptions,
            [chatId]: {
              chatId,
              chatTitle,
              subscribedAt: Date.now(),
            },
          },
        })),

      unsubscribe: (chatId) =>
        set((state) => {
          const subscriptions = { ...state.subscriptions };
          const buildCheckpoints = { ...state.buildCheckpoints };
          delete subscriptions[chatId];
          delete buildCheckpoints[chatId];
          return { subscriptions, buildCheckpoints };
        }),

      isSubscribed: (chatId) => Boolean(get().subscriptions[chatId]),

      getSubscription: (chatId) => get().subscriptions[chatId],

      getAllSubscriptions: () => Object.values(get().subscriptions),

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
      version: 2,
      partialize: (state) => ({
        subscriptions: state.subscriptions,
        buildCheckpoints: state.buildCheckpoints,
        browserPermission: state.browserPermission,
      }),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== "object") {
          return {
            subscriptions: {},
            buildCheckpoints: {},
            browserPermission: resolveInitialBrowserPermission(),
          } satisfies PersistedNotificationsState;
        }

        const typed = persistedState as PersistedNotificationsState;
        if (version < 2) {
          return {
            subscriptions: typed.subscriptions ?? {},
            buildCheckpoints: {},
            browserPermission: resolveInitialBrowserPermission(),
          } satisfies PersistedNotificationsState;
        }

        return {
          subscriptions: typed.subscriptions ?? {},
          buildCheckpoints: typed.buildCheckpoints ?? {},
          browserPermission:
            typed.browserPermission ?? resolveInitialBrowserPermission(),
        } satisfies PersistedNotificationsState;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
