"use client";

import { memo } from "react";
import { DashboardLayout } from "./dashboardLayout";
import { KanbanLayout } from "./kanbanLayout";
import { LayoutType } from "./layoutTypes";
import { MarketingLayout } from "./marketingLayout";
import { SettingsLayout } from "./settingsLayout";

interface LayoutRendererProps {
  type: LayoutType;
}

export const LayoutRenderer = memo(function LayoutRenderer({
  type,
}: LayoutRendererProps) {
  switch (type) {
    case LayoutType.DASHBOARD:
      return <DashboardLayout />;
    case LayoutType.MARKETING:
      return <MarketingLayout />;
    case LayoutType.KANBAN:
      return <KanbanLayout />;
    case LayoutType.SETTINGS:
      return <SettingsLayout />;
  }
});
