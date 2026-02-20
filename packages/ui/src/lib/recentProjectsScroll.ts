export const LOCATION_CHANGE_EVENT = "edward:location-change";

const QUICK_SCROLL_DURATION_MS = 240;

function findScrollableAncestor(element: HTMLElement) {
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const isScrollable = /(auto|scroll)/.test(style.overflowY);
    if (isScrollable && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function easeOutQuart(progress: number) {
  return 1 - (1 - progress) ** 4;
}

export function quickScrollToElementById(
  elementId: string,
  offset = 16,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const section = document.getElementById(elementId);
  if (!section) {
    return false;
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const scrollContainer = findScrollableAncestor(section);

  if (!scrollContainer) {
    section.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    return true;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const startScrollTop = scrollContainer.scrollTop;
  const targetScrollTop =
    startScrollTop + (sectionRect.top - containerRect.top) - offset;

  if (prefersReducedMotion) {
    scrollContainer.scrollTop = targetScrollTop;
    return true;
  }

  const startTime = performance.now();
  const step = (timestamp: number) => {
    const progress = Math.min(
      (timestamp - startTime) / QUICK_SCROLL_DURATION_MS,
      1,
    );
    const eased = easeOutQuart(progress);
    scrollContainer.scrollTop =
      startScrollTop + (targetScrollTop - startScrollTop) * eased;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
  return true;
}

export function quickScrollToRecentProjects() {
  return quickScrollToElementById("recent-projects");
}
