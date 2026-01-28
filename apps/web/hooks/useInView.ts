"use client"

import { useState, useEffect, useCallback } from "react"

interface UseInViewOptions extends IntersectionObserverInit {
    once?: boolean
}

export function useInView({
    threshold = 0,
    root = null,
    rootMargin = "0px",
    once = false,
}: UseInViewOptions = {}) {
    const [isInView, setInView] = useState(false)
    const [node, setNode] = useState<HTMLElement | null>(null)

    const ref = useCallback((node: HTMLElement | null) => {
        setNode(node)
    }, [])

    useEffect(() => {
        if (!node) return

        const observer = new IntersectionObserver(
            ([entry]: IntersectionObserverEntry[]) => {
                const isIntersecting = entry?.isIntersecting ?? false
                setInView(isIntersecting)

                if (isIntersecting && once) {
                    observer.disconnect()
                }
            },
            { threshold, root, rootMargin }
        )

        observer.observe(node)

        return () => observer.disconnect()
    }, [node, threshold, root, rootMargin, once])

    return { ref, isInView }
}
