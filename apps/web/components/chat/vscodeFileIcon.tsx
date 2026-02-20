"use client";

import { useEffect, useMemo, useRef } from "react";
import { FileCode2, FolderClosed, FolderOpen } from "lucide-react";
import { themeIcons } from "seti-file-icons";
import { cn } from "@edward/ui/lib/utils";

const ALLOWED_SVG_TAGS = new Set([
  "svg",
  "path",
  "g",
  "circle",
  "ellipse",
  "rect",
  "polygon",
  "polyline",
  "line",
  "defs",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
  "desc",
  "use",
  "symbol",
  "mask",
  "pattern",
  "text",
  "tspan",
  "textpath",
]);

const ALLOWED_SVG_ATTRS = new Set([
  "viewbox",
  "width",
  "height",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "transform",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "id",
  "class",
  "clip-path",
  "mask",
  "href",
  "xlink:href",
  "preserveaspectratio",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "text-anchor",
  "font-size",
  "font-family",
  "dominant-baseline",
  "vector-effect",
  "fill-rule",
  "clip-rule",
]);

function sanitizeSvg(svg: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(svg, "text/html");
  const root = parsed.querySelector("svg");
  if (!root) {
    return null;
  }

  const sanitizeElement = (element: Element) => {
    const lowerTag = element.tagName.toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(lowerTag)) {
      element.remove();
      return;
    }

    for (const attr of Array.from(element.attributes)) {
      const lowerAttr = attr.name.toLowerCase();
      const isEventHandler = lowerAttr.startsWith("on");
      const hasJavascriptProtocol = /javascript\s*:/i.test(attr.value);
      if (
        !ALLOWED_SVG_ATTRS.has(lowerAttr) ||
        isEventHandler ||
        hasJavascriptProtocol
      ) {
        element.removeAttribute(attr.name);
      }
    }

    for (const child of Array.from(element.children)) {
      sanitizeElement(child);
    }
  };

  sanitizeElement(root);
  if (!(root instanceof SVGSVGElement)) {
    return null;
  }

  return root;
}

const getSetiIcon = themeIcons({
  blue: "#519aba",
  grey: "#4d5a5e",
  "grey-light": "#6d8086",
  green: "#8dc149",
  orange: "#e37933",
  pink: "#f55385",
  purple: "#a074c4",
  red: "#cc3e44",
  white: "#d4d7d6",
  yellow: "#cbcb41",
  ignore: "#41535b",
});

interface VscodeFileIconProps {
  path: string;
  isFolder?: boolean;
  isOpen?: boolean;
  className?: string;
}

function getSetiTarget(
  path: string,
  isFolder: boolean,
  isOpen: boolean,
): string {
  const base = path.split("/").filter(Boolean).pop() || path;
  if (!isFolder) {
    return base;
  }
  return isOpen ? "folder-open" : base;
}

export function VscodeFileIcon({
  path,
  isFolder = false,
  isOpen = false,
  className,
}: VscodeFileIconProps) {
  const icon = useMemo(
    () => getSetiIcon(getSetiTarget(path, isFolder, isOpen)),
    [isFolder, isOpen, path],
  );
  const iconContainerRef = useRef<HTMLSpanElement | null>(null);
  const sanitizedSvg = useMemo<SVGSVGElement | null>(
    () => (icon?.svg ? sanitizeSvg(icon.svg) : null),
    [icon?.svg],
  );

  useEffect(() => {
    if (!sanitizedSvg || !iconContainerRef.current) {
      return;
    }

    const container = iconContainerRef.current;
    const svgElement = sanitizedSvg.cloneNode(true);
    if (!(svgElement instanceof SVGSVGElement)) {
      container.replaceChildren();
      return;
    }

    svgElement.setAttribute("focusable", "false");
    svgElement.setAttribute("aria-hidden", "true");
    container.replaceChildren(svgElement);

    return () => {
      container.replaceChildren();
    };
  }, [sanitizedSvg]);

  if (!sanitizedSvg) {
    if (isFolder) {
      const FolderIcon = isOpen ? FolderOpen : FolderClosed;
      return (
        <FolderIcon
          className={cn(
            "h-4 w-4 shrink-0 text-workspace-foreground/70",
            className,
          )}
        />
      );
    }
    return (
      <FileCode2
        className={cn(
          "h-4 w-4 shrink-0 text-workspace-foreground/70",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center text-workspace-foreground/80 [&_svg]:h-full [&_svg]:w-full [&_path]:fill-current [&_g]:fill-current",
        className,
      )}
      style={icon.color ? { color: icon.color } : undefined}
      ref={iconContainerRef}
    />
  );
}
