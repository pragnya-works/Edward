export enum LayoutType {
  DASHBOARD = "dashboard",
  MARKETING = "marketing",
  KANBAN = "kanban",
  SETTINGS = "settings",
}

export const LAYOUT_ORDER: LayoutType[] = [
  LayoutType.DASHBOARD,
  LayoutType.MARKETING,
  LayoutType.KANBAN,
  LayoutType.SETTINGS,
];
