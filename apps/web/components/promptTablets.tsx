"use client";

import { memo, useCallback } from "react";
import { cn } from "@edward/ui/lib/utils";
import { Button } from "@edward/ui/components/button";
import {
  LayoutTemplate,
  LayoutDashboard,
  ShoppingCart,
  Shield,
} from "lucide-react";

export interface PromptTablet {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

export const PROMPT_TABLETS: PromptTablet[] = [
  {
    id: "landing-page",
    label: "Landing page",
    icon: <LayoutTemplate className="h-3.5 w-3.5" />,
    prompt: `Design and build a stunning SaaS landing page with a modern aesthetic.

Hero Section: Bold typography with an animated gradient headline, high-quality product mockup with subtle entry animations, and clear call-to-action buttons. Use a glassmorphism effect for the navigation bar.

Features Grid: A 3x2 grid of cards featuring lucide icons, descriptive headers, and smooth hover-lift effects with subtle shadows.

Social Proof: A scroll-animated logo cloud and a responsive testimonial section with user avatars and star ratings.

Pricing: A clear three-tier pricing table with a highlighted 'Most Popular' plan, featuring smooth transitions and toggle for monthly/yearly views.

Tech Stack: React, Tailwind CSS, and shadcn/ui components. Focus on responsive layout, accessibility, and high-performance frontend code.`,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-3.5 w-3.5" />,
    prompt: `Create a professional analytics dashboard UI with a clean, data-driven design.

Layout:
- A responsive sidebar with active navigation states and collapsed mode.
- A top navigation bar with a global search input and profile dropdown.

UI Components:
1. KPI Overview: A row of four cards showing metrics like revenue and active users, complete with trend indicators and micro-charts.
2. Data Visualization: A beautiful line chart for trend analysis and a donut chart for category breakdown using Recharts.
3. Data Table: A complex table UI with sorting indicators, status badges, and row selection states.
4. Empty States: Well-designed skeleton loaders and empty state illustrations.

Tech Stack: React, Tailwind CSS, and Recharts. Ensure full dark mode support and smooth UI transitions.`,
  },
  {
    id: "e-commerce",
    label: "E-commerce",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    prompt: `Build a modern and responsive e-commerce product detail page.

Product Interface:
1. Image Gallery: A large product display with a thumbnail carousel below. Include hover-to-zoom and a lightbox modal.
2. Product Details: Dynamic price display, star ratings, and clear variant selectors (color swatches and size buttons).
3. Cart Actions: 'Add to Cart' button with a loading state and a quantity selector.
4. Information Architecture: Tabs for product description, specifications, and customer reviews.

Frontend Features:
Include a 'Related Products' horizontal scroll section and a sticky mobile footer for the buy action. Use React and Tailwind CSS for a polished, mobile-first experience.`,
  },
  {
    id: "auth",
    label: "Auth screens",
    icon: <Shield className="h-3.5 w-3.5" />,
    prompt: `Design a set of polished authentication UI screens with a modern look and feel.

Screens:
1. Login: A clean form with email/password fields, 'forgot password' link, and social login buttons.
2. Signup: Multi-step or single-page form with real-time password strength validation.
3. Password Reset: A streamlined flow for requesting and setting a new password.

UI/UX Requirements:
- Form validation with beautiful inline error messages and success states.
- Loading states for all action buttons.
- Responsive split-screen layout with an inspirational side panel on desktop.
- Proper focus management for keyboard accessibility.

Tech Stack: React, Tailwind CSS, and shadcn/ui. Focus on form state management and interactive feedback.`,
  },
];

interface PromptTabletButtonProps {
  tablet: PromptTablet;
  onClick: (prompt: string) => void;
  isCompact?: boolean;
}

const PromptTabletButton = memo(function PromptTabletButton({
  tablet,
  onClick,
  isCompact = false,
}: PromptTabletButtonProps) {
  const handleClick = useCallback(() => {
    onClick(tablet.prompt);
  }, [onClick, tablet.prompt]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className={cn(
        "rounded-full h-auto gap-2 font-medium group",
        "border-border dark:border-border/30 dark:border-white/10 bg-background/80 backdrop-blur-sm",
        "px-4 py-2 text-xs shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:shadow-none",
        "text-foreground/90",
        "hover:border-primary/40 hover:bg-primary/5 hover:text-primary hover:shadow-lg hover:shadow-primary/5",
        "hover:-translate-y-0.5",
        "active:translate-y-0 active:scale-95 active:shadow-sm",
        "transition-all duration-200 ease-out",
        "[&_svg]:text-muted-foreground/80 hover:[&_svg]:text-primary",
        isCompact && "px-3 py-1.5 text-[11px]",
      )}
    >
      <span className="transition-transform duration-200 group-hover:scale-110">
        {tablet.icon}
      </span>
      <span className="whitespace-nowrap">{tablet.label}</span>
    </Button>
  );
});

interface PromptTabletsProps {
  onSelectPrompt: (prompt: string) => void;
  className?: string;
  isCompact?: boolean;
}

export const PromptTablets = memo(function PromptTablets({
  onSelectPrompt,
  className,
  isCompact = false,
}: PromptTabletsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2.5",
        className,
      )}
    >
      {PROMPT_TABLETS.map((tablet) => (
        <PromptTabletButton
          key={tablet.id}
          tablet={tablet}
          onClick={onSelectPrompt}
          isCompact={isCompact}
        />
      ))}
    </div>
  );
});