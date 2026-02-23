"use client";

import { memo } from "react";
import {
  BlueprintAnnotations,
  BlueprintContentSections,
  BlueprintGridAndFrame,
} from "./cardVisual.parts";

export const TechnicalBlueprint = memo(function TechnicalBlueprint({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={className}>
      <svg
        viewBox="0 0 280 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <BlueprintGridAndFrame />
        <BlueprintContentSections />
        <BlueprintAnnotations />
      </svg>
    </div>
  );
});
