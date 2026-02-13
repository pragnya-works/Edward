"use client";

import { memo } from "react";

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
        <g opacity="0.35" stroke="currentColor" strokeWidth="0.7">
          <line x1="0" y1="30" x2="280" y2="30" strokeDasharray="2 6" />
          <line x1="0" y1="58" x2="280" y2="58" strokeDasharray="2 6" />
          <line x1="0" y1="100" x2="280" y2="100" strokeDasharray="2 6" />
          <line x1="0" y1="145" x2="280" y2="145" strokeDasharray="2 6" />
          <line x1="0" y1="172" x2="280" y2="172" strokeDasharray="2 6" />
          <line x1="30" y1="0" x2="30" y2="200" strokeDasharray="2 6" />
          <line x1="250" y1="0" x2="250" y2="200" strokeDasharray="2 6" />
          {[30, 60, 90, 120, 150, 180, 210, 240].map((x) => (
            <line
              key={`t-${x}`}
              x1={x}
              y1="0"
              x2={x}
              y2="4"
              strokeWidth="0.4"
            />
          ))}
          {[30, 58, 100, 145, 172].map((y) => (
            <line
              key={`l-${y}`}
              x1="0"
              y1={y}
              x2="4"
              y2={y}
              strokeWidth="0.4"
            />
          ))}
        </g>

        <g>
          <rect
            x="30"
            y="16"
            width="220"
            height="160"
            rx="6"
            stroke="currentColor"
            strokeWidth="1.2"
            opacity="0.5"
          />
          <line
            x1="30"
            y1="30"
            x2="250"
            y2="30"
            stroke="currentColor"
            strokeWidth="0.7"
            opacity="0.3"
          />
          <circle cx="40" cy="23" r="2" fill="currentColor" opacity="0.2" />
          <circle cx="47" cy="23" r="2" fill="currentColor" opacity="0.15" />
          <circle cx="54" cy="23" r="2" fill="currentColor" opacity="0.1" />
          <rect
            x="68"
            y="20.5"
            width="60"
            height="5"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="0.4"
            opacity="0.3"
          />
          <rect
            x="71"
            y="22.5"
            width="2.5"
            height="2"
            rx="0.3"
            stroke="currentColor"
            strokeWidth="0.3"
            opacity="0.25"
          />
          <path
            d="M71.5 22.5 V21.8 A0.8 0.8 0 0 1 73 21.8 V22.5"
            stroke="currentColor"
            strokeWidth="0.3"
            opacity="0.25"
          />
        </g>

        <g stroke="currentColor" fill="none">
          <rect
            x="36"
            y="34"
            width="208"
            height="18"
            rx="2"
            strokeWidth="0.9"
            opacity="0.5"
            strokeDasharray="3 3"
          />
          <rect
            x="42"
            y="40"
            width="24"
            height="3"
            rx="1"
            fill="currentColor"
            opacity="0.12"
          />
          <rect
            x="72"
            y="40"
            width="16"
            height="3"
            rx="1"
            fill="currentColor"
            opacity="0.08"
          />
          <rect
            x="94"
            y="40"
            width="16"
            height="3"
            rx="1"
            fill="currentColor"
            opacity="0.08"
          />
          <rect
            x="116"
            y="40"
            width="16"
            height="3"
            rx="1"
            fill="currentColor"
            opacity="0.08"
          />
          <rect
            x="216"
            y="38.5"
            width="22"
            height="7"
            rx="3.5"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.2"
          />

          <rect
            x="36"
            y="58"
            width="208"
            height="38"
            rx="2"
            strokeWidth="1.1"
            opacity="0.6"
          />
          <rect
            x="70"
            y="65"
            width="90"
            height="4"
            rx="1.5"
            fill="currentColor"
            opacity="0.15"
          />
          <rect
            x="85"
            y="73"
            width="60"
            height="2.5"
            rx="1"
            fill="currentColor"
            opacity="0.08"
          />
          <rect
            x="110"
            y="82"
            width="32"
            height="8"
            rx="4"
            stroke="currentColor"
            strokeWidth="0.8"
            opacity="0.3"
          />
          <rect
            x="116"
            y="84.5"
            width="20"
            height="3"
            rx="1"
            fill="currentColor"
            opacity="0.1"
          />

          <rect
            x="36"
            y="102"
            width="64"
            height="38"
            rx="2"
            strokeWidth="0.9"
            opacity="0.3"
            strokeDasharray="2 3"
          />
          <rect
            x="106"
            y="102"
            width="64"
            height="38"
            rx="2"
            strokeWidth="0.9"
            opacity="0.3"
            strokeDasharray="2 3"
          />
          <rect
            x="176"
            y="102"
            width="68"
            height="38"
            rx="2"
            strokeWidth="0.9"
            opacity="0.3"
            strokeDasharray="2 3"
          />
          <rect
            x="42"
            y="108"
            width="52"
            height="14"
            rx="1.5"
            fill="currentColor"
            opacity="0.04"
          />
          <rect
            x="42"
            y="126"
            width="36"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.06"
          />
          <rect
            x="42"
            y="131"
            width="48"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.04"
          />
          <rect
            x="112"
            y="108"
            width="52"
            height="14"
            rx="1.5"
            fill="currentColor"
            opacity="0.04"
          />
          <rect
            x="112"
            y="126"
            width="40"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.06"
          />
          <rect
            x="112"
            y="131"
            width="44"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.04"
          />
          <rect
            x="182"
            y="108"
            width="56"
            height="14"
            rx="1.5"
            fill="currentColor"
            opacity="0.04"
          />
          <rect
            x="182"
            y="126"
            width="38"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.06"
          />
          <rect
            x="182"
            y="131"
            width="50"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.04"
          />

          <rect
            x="36"
            y="148"
            width="208"
            height="18"
            rx="2"
            strokeWidth="0.5"
            opacity="0.2"
            strokeDasharray="2 4"
          />
          <rect
            x="56"
            y="155"
            width="28"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.06"
          />
          <rect
            x="92"
            y="155"
            width="20"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.04"
          />
          <rect
            x="120"
            y="155"
            width="24"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.04"
          />
        </g>

        <g fill="currentColor" opacity="0.5">
          <rect x="34" y="56" width="4" height="4" rx="0.5" />
          <rect x="242" y="56" width="4" height="4" rx="0.5" />
          <rect x="34" y="94" width="4" height="4" rx="0.5" />
          <rect x="242" y="94" width="4" height="4" rx="0.5" />
          <rect x="138" y="56" width="4" height="3" rx="0.5" opacity="0.3" />
          <rect x="138" y="95" width="4" height="3" rx="0.5" opacity="0.3" />
          <rect x="34" y="74" width="3" height="4" rx="0.5" opacity="0.3" />
          <rect x="243" y="74" width="3" height="4" rx="0.5" opacity="0.3" />
        </g>

        <g
          transform="translate(145, 85) scale(0.6)"
          className="pointer-events-none select-none"
          opacity="1"
        >
          <path
            fill="currentColor"
            d="M6.313 1.054a1.5 1.5 0 0 0-2.313 1.28v11.517a1.5 1.5 0 0 0 2.508 1.111l2.583-2.316 2.802 6.002a1.5 1.5 0 1 0 2.716-1.267l-2.822-6.046 3.287.05a1.5 1.5 0 0 0 1.058-2.564L6.313 1.054Z"
            stroke="currentColor"
            strokeWidth="0.8"
          />
        </g>

        <g stroke="currentColor" strokeWidth="0.5" opacity="0.25">
          <line x1="26" y1="52" x2="26" y2="58" />
          <line x1="24" y1="52" x2="28" y2="52" />
          <line x1="24" y1="58" x2="28" y2="58" />
          <line x1="36" y1="180" x2="244" y2="180" />
          <line x1="36" y1="178" x2="36" y2="182" />
          <line x1="244" y1="178" x2="244" y2="182" />
          <line x1="256" y1="58" x2="256" y2="96" />
          <line x1="254" y1="58" x2="258" y2="58" />
          <line x1="254" y1="96" x2="258" y2="96" />
          <line x1="36" y1="144" x2="100" y2="144" />
          <line x1="36" y1="142.5" x2="36" y2="145.5" />
          <line x1="100" y1="142.5" x2="100" y2="145.5" />
        </g>

        <g
          fontSize="4"
          fontFamily="monospace"
          fill="currentColor"
          opacity="0.35"
        >
          <text
            x="22"
            y="56"
            textAnchor="middle"
            transform="rotate(-90, 22, 56)"
          >
            6px
          </text>
          <text x="140" y="188" textAnchor="middle">
            208px
          </text>
          <text
            x="262"
            y="80"
            textAnchor="start"
            transform="rotate(90, 262, 77)"
          >
            38px
          </text>
          <text x="68" y="143" textAnchor="middle" fontSize="3.5">
            64
          </text>
        </g>

        <g
          fontSize="5"
          fontFamily="monospace"
          fill="currentColor"
          opacity="0.6"
          letterSpacing="0.5"
          fontWeight="bold"
        >
          <text x="140" y="46" textAnchor="middle">
            NAV
          </text>
          <text x="140" y="80" textAnchor="middle" fontSize="5.5" opacity="0.8">
            HERO
          </text>
          <text x="68" y="118" textAnchor="middle">
            COL
          </text>
          <text x="138" y="118" textAnchor="middle">
            COL
          </text>
          <text x="210" y="118" textAnchor="middle">
            COL
          </text>
          <text x="140" y="160" textAnchor="middle">
            FTR
          </text>
        </g>

        <g
          fontSize="4.5"
          fontFamily="monospace"
          fill="currentColor"
          opacity="0.3"
        >
          <text x="210" y="10">
            v1.0-grid
          </text>
          <text x="6" y="196">
            COMP::RENDER
          </text>
          <text x="218" y="196">
            12-COL
          </text>
        </g>

        <g fill="currentColor" opacity="0.06">
          {[50, 80, 110, 140, 170, 200, 230].map((x) =>
            [40, 60, 80, 100, 120, 140, 160].map((y) => (
              <circle key={`d-${x}-${y}`} cx={x} cy={y} r="0.5" />
            )),
          )}
        </g>
      </svg>
    </div>
  );
});
