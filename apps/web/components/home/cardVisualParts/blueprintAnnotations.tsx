import { Fragment } from "react";

export function BlueprintAnnotations() {
  return (
    <Fragment>
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

      <g transform="translate(145, 85) scale(0.6)" className="pointer-events-none select-none" opacity="1">
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

      <g fontSize="4" fontFamily="monospace" fill="currentColor" opacity="0.35">
        <text x="22" y="56" textAnchor="middle" transform="rotate(-90, 22, 56)">
          6px
        </text>
        <text x="140" y="188" textAnchor="middle">
          208px
        </text>
        <text x="262" y="80" textAnchor="start" transform="rotate(90, 262, 77)">
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

      <g fontSize="4.5" fontFamily="monospace" fill="currentColor" opacity="0.3">
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
            <circle key={`dot-${x}-${y}`} cx={x} cy={y} r="0.5" />
          )),
        )}
      </g>
    </Fragment>
  );
}
