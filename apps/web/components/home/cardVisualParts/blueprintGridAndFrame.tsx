import { Fragment } from "react";

export function BlueprintGridAndFrame() {
  return (
    <Fragment>
      <g opacity="0.35" stroke="currentColor" strokeWidth="0.7">
        <line x1="0" y1="30" x2="280" y2="30" strokeDasharray="2 6" />
        <line x1="0" y1="58" x2="280" y2="58" strokeDasharray="2 6" />
        <line x1="0" y1="100" x2="280" y2="100" strokeDasharray="2 6" />
        <line x1="0" y1="145" x2="280" y2="145" strokeDasharray="2 6" />
        <line x1="0" y1="172" x2="280" y2="172" strokeDasharray="2 6" />
        <line x1="30" y1="0" x2="30" y2="200" strokeDasharray="2 6" />
        <line x1="250" y1="0" x2="250" y2="200" strokeDasharray="2 6" />
        {[30, 60, 90, 120, 150, 180, 210, 240].map((x) => (
          <line key={`top-tick-${x}`} x1={x} y1="0" x2={x} y2="4" strokeWidth="0.4" />
        ))}
        {[30, 58, 100, 145, 172].map((y) => (
          <line key={`left-tick-${y}`} x1="0" y1={y} x2="4" y2={y} strokeWidth="0.4" />
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
    </Fragment>
  );
}
