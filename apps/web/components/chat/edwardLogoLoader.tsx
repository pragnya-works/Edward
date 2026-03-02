import type { CSSProperties } from "react";
import { cn } from "@edward/ui/lib/utils";

interface EdwardLogoLoaderProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  withBackground?: boolean;
}

const TOTAL = 4.5;

const DRAW_START   = 0.1;
const DRAW_END     = { diamond: 0.60, e: 0.92, w: 1.00 };
const FILL_START   = 1.15;
const FILL_END     = 1.60;
const SHINE_START  = 1.25;
const SHINE_PEAK   = 1.81;
const SHINE_END    = 2.65;
const UNDRAW_START = 3.05;
const UNDRAW_END   = { diamond: 3.55, e: 3.87, w: 3.95 };
const UNFILL_END   = 3.40;

const pct = (t: number) => `${((t / TOTAL) * 100).toFixed(2)}%`;

const strokeBase: CSSProperties = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeDasharray: 1,
  strokeDashoffset: 1,
};

export function EdwardLogoLoader({
  size,
  className,
  style,
  withBackground = false,
}: EdwardLogoLoaderProps) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-black dark:text-white",
        withBackground && "rounded-3xl p-3",
        !size && "w-full h-full",
        className,
      )}
      style={{ ...(size !== undefined ? { width: size, height: size } : {}), ...style }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 251 250"
        className="h-full w-full"
        style={{ overflow: "visible", transform: "translateZ(0)" }}
        aria-hidden="true"
      >
        <defs>
          <style>
            {`
              @keyframes edw-stroke-diamond {
                0%, ${pct(DRAW_START)}  { stroke-dashoffset:  1; animation-timing-function: cubic-bezier(0.42,0,1,1); }
                ${pct(DRAW_END.diamond)}  { stroke-dashoffset:  0; animation-timing-function: linear; }
                ${pct(UNDRAW_START)}    { stroke-dashoffset:  0; animation-timing-function: cubic-bezier(0,0,0.58,1); }
                ${pct(UNDRAW_END.diamond)}, 100% { stroke-dashoffset: -1; }
              }

              @keyframes edw-stroke-e {
                0%, ${pct(DRAW_START)}  { stroke-dashoffset:  1; animation-timing-function: cubic-bezier(0.42,0,1,1); }
                ${pct(DRAW_END.e)}      { stroke-dashoffset:  0; animation-timing-function: linear; }
                ${pct(UNDRAW_START)}    { stroke-dashoffset:  0; animation-timing-function: cubic-bezier(0,0,0.58,1); }
                ${pct(UNDRAW_END.e)}, 100% { stroke-dashoffset: -1; }
              }

              @keyframes edw-stroke-w {
                0%, ${pct(DRAW_START)}  { stroke-dashoffset:  1; animation-timing-function: cubic-bezier(0.42,0,1,1); }
                ${pct(DRAW_END.w)}      { stroke-dashoffset:  0; animation-timing-function: linear; }
                ${pct(UNDRAW_START)}    { stroke-dashoffset:  0; animation-timing-function: cubic-bezier(0,0,0.58,1); }
                ${pct(UNDRAW_END.w)}, 100% { stroke-dashoffset: -1; }
              }

              @keyframes edw-opacity-loop {
                0%, ${pct(FILL_START)}  { opacity: 0; }
                ${pct(FILL_END)}        { opacity: 1; }
                ${pct(UNDRAW_START)}    { opacity: 1; }
                ${pct(UNFILL_END)}, 100% { opacity: 0; }
              }

              @keyframes edw-shine-loop {
                0%, ${pct(SHINE_START)}  { filter: drop-shadow(0 0 0px currentColor); }
                ${pct(SHINE_PEAK)}       { filter: drop-shadow(0 0 4px currentColor) drop-shadow(0 0 8px currentColor); }
                ${pct(SHINE_END)}, 100%  { filter: drop-shadow(0 0 0px currentColor); }
              }

              :root:not(.dark) .edw-s { filter: none !important; }
            `}
          </style>
        </defs>

        <path
          pathLength={1}
          className="edw-s"
          d="m122.9 44.32-59.22 34.65 59.02 34.94 59.18-35.29-58.98-34.3z"
          strokeMiterlimit={10}
          style={{
            ...strokeBase,
            animation: `edw-stroke-diamond ${TOTAL}s infinite, edw-shine-loop ${TOTAL}s infinite`,
          }}
        />
        <path
          d="m122.9 44.32-59.22 34.65 59.02 34.94 59.18-35.29-58.98-34.3z"
          fill="currentColor"
          style={{ opacity: 0, animation: `edw-opacity-loop ${TOTAL}s infinite` }}
        />

        <path
          pathLength={1}
          className="edw-s"
          d="m62.52 83.31v74.88l58.3 34.13v-18.8l-42.5-25v-9.66l29.41 17.89v-20.03l-29.25-16.29v-9.01l42.26 24.06v-18.56l-58.22-33.61z"
          strokeMiterlimit={10}
          style={{
            ...strokeBase,
            animation: `edw-stroke-e ${TOTAL}s infinite, edw-shine-loop ${TOTAL}s infinite`,
          }}
        />
        <path
          d="m62.52 83.31v74.88l58.3 34.13v-18.8l-42.5-25v-9.66l29.41 17.89v-20.03l-29.25-16.29v-9.01l42.26 24.06v-18.56l-58.22-33.61z"
          fill="currentColor"
          style={{ opacity: 0, animation: `edw-opacity-loop ${TOTAL}s infinite` }}
        />

        <path
          pathLength={1}
          className="edw-s"
          d="m124.3 116.9 14.82-8.89-0.08 37.87 12.21-43.89 4.84-3.51 12.13 33.11v-39.99l15.29-9.01v75.74l-18.64 11.46-10.38-27.2-10.14 38.19-20.05 11.83v-75.71z"
          strokeMiterlimit={10}
          style={{
            ...strokeBase,
            animation: `edw-stroke-w ${TOTAL}s infinite, edw-shine-loop ${TOTAL}s infinite`,
          }}
        />
        <path
          d="m124.3 116.9 14.82-8.89-0.08 37.87 12.21-43.89 4.84-3.51 12.13 33.11v-39.99l15.29-9.01v75.74l-18.64 11.46-10.38-27.2-10.14 38.19-20.05 11.83v-75.71z"
          fill="currentColor"
          style={{ opacity: 0, animation: `edw-opacity-loop ${TOTAL}s infinite` }}
        />
      </svg>
    </div>
  );
}