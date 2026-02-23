export interface MonacoThemeDefinition {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: unknown[];
  colors: Record<string, string>;
}

export interface MonacoApi {
  editor: {
    defineTheme: (themeName: string, themeData: MonacoThemeDefinition) => void;
    setTheme: (themeName: string) => void;
  };
}

interface WorkspacePalette {
  background?: string;
  foreground?: string;
  border?: string;
  active?: string;
  accent?: string;
  gutterForeground?: string;
  gutterLine?: string;
}

export const WORKSPACE_MONACO_THEME = "workspace-theme";

function readCssVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function normalizeMonacoColor(value: string): string | undefined {
  const normalizedValue = value.trim();

  if (/^#[0-9a-f]{3}$/i.test(normalizedValue)) {
    return `#${normalizedValue[1]}${normalizedValue[1]}${normalizedValue[2]}${normalizedValue[2]}${normalizedValue[3]}${normalizedValue[3]}`.toLowerCase();
  }

  if (/^#[0-9a-f]{4}$/i.test(normalizedValue)) {
    return `#${normalizedValue[1]}${normalizedValue[1]}${normalizedValue[2]}${normalizedValue[2]}${normalizedValue[3]}${normalizedValue[3]}${normalizedValue[4]}${normalizedValue[4]}`.toLowerCase();
  }

  if (
    /^#[0-9a-f]{6}$/i.test(normalizedValue) ||
    /^#[0-9a-f]{8}$/i.test(normalizedValue)
  ) {
    return normalizedValue.toLowerCase();
  }

  const rgb = normalizedValue.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i,
  );
  if (!rgb) {
    return undefined;
  }

  const [red, green, blue] = [rgb[1], rgb[2], rgb[3]].map((valuePart) =>
    Math.max(0, Math.min(255, Number(valuePart))).toString(16).padStart(2, "0"),
  );
  const alpha = rgb[4];
  if (typeof alpha === "string") {
    const normalizedAlpha = Math.max(0, Math.min(1, Number(alpha)));
    return `#${red}${green}${blue}${Math.round(normalizedAlpha * 255)
      .toString(16)
      .padStart(2, "0")}`.toLowerCase();
  }

  return `#${red}${green}${blue}`.toLowerCase();
}

function resolveMonacoColor(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const directColor = normalizeMonacoColor(value);
  if (directColor) {
    return directColor;
  }

  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = value;

  if (!probe.style.color) {
    return undefined;
  }

  probe.style.position = "fixed";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.inset = "0";
  document.documentElement.appendChild(probe);
  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  return normalizeMonacoColor(resolvedColor);
}

function readWorkspacePalette(): WorkspacePalette {
  const readColor = (token: string) => resolveMonacoColor(readCssVariable(token));

  return {
    background: readColor("--workspace-bg"),
    foreground: readColor("--workspace-foreground"),
    border: readColor("--workspace-border"),
    active: readColor("--workspace-active"),
    accent: readColor("--workspace-accent"),
    gutterForeground: readColor("--workspace-gutter-fg"),
    gutterLine: readColor("--workspace-gutter-line"),
  };
}

function isDarkThemeColor(hexColor?: string): boolean {
  if (!hexColor) {
    return document.documentElement.classList.contains("dark");
  }

  const normalized = hexColor.replace("#", "");
  const rgb = normalized.length === 8 ? normalized.slice(0, 6) : normalized;

  if (rgb.length !== 6) {
    return document.documentElement.classList.contains("dark");
  }

  const red = Number.parseInt(rgb.slice(0, 2), 16);
  const green = Number.parseInt(rgb.slice(2, 4), 16);
  const blue = Number.parseInt(rgb.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance < 140;
}

export function applyWorkspaceMonacoTheme(monaco: MonacoApi): void {
  const palette = readWorkspacePalette();
  const selectionColor = palette.active ?? palette.border;

  const colors = {
    "editor.background": palette.background,
    "editor.foreground": palette.foreground,
    "editorLineNumber.foreground": palette.gutterForeground ?? palette.foreground,
    "editorLineNumber.activeForeground": palette.foreground,
    "editor.selectionBackground": selectionColor,
    "editor.inactiveSelectionBackground": selectionColor,
    "editorCursor.foreground": palette.accent,
    "editorIndentGuide.background1": palette.gutterLine ?? palette.border,
    "editorLineNumber.border": palette.gutterLine ?? palette.border,
    "editorBracketMatch.background": selectionColor,
  };

  monaco.editor.defineTheme(WORKSPACE_MONACO_THEME, {
    base: isDarkThemeColor(palette.background) ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: Object.fromEntries(
      Object.entries(colors).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>,
  });
}
