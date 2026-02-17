"use client"

import { useSyncExternalStore } from "react"

const VISIBLE_VISIBILITY_STATE: DocumentVisibilityState = "visible"

function subscribe(callback: () => void) {
    document.addEventListener("visibilitychange", callback)
    return () => document.removeEventListener("visibilitychange", callback)
}

function getSnapshot() {
    return document.visibilityState === VISIBLE_VISIBILITY_STATE
}

function getServerSnapshot() {
    return true
}

export function useTabVisibility() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
