import { useId, type SVGProps } from "react";

export type FrameworkKey = "next" | "vite" | "javascript";

interface FrameworkIconProps {
  framework: FrameworkKey;
  className?: string;
}

export function FrameworkIcon({ framework, className }: FrameworkIconProps) {
  switch (framework) {
    case "next":
      return <Nextjs className={className} />;
    case "vite":
      return <Vite className={className} />;
    case "javascript":
      return <JavaScript className={className} />;
    default:
      return null;
  }
}

export function detectFramework(
  files: { path: string; content?: string }[],
): FrameworkKey | null {
  const paths = files.map((f) => f.path.toLowerCase());
  const hasPath = (pattern: RegExp) => paths.some((p) => pattern.test(p));

  const packageFile = files.find(
    (f) => f.path.toLowerCase() === "package.json" && f.content,
  );
  if (packageFile?.content) {
    try {
      const parsed = JSON.parse(packageFile.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps: Record<string, string> = {
        ...parsed.dependencies,
        ...parsed.devDependencies,
      };

      if (deps.next) return "next";
      if (deps.vite || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-react-swc"]) {
        return "vite";
      }
      if (deps.react) return "vite";
    } catch {
      // ignore malformed package.json
    }
  }

  if (
    hasPath(/(^|\/)next\.config\./) ||
    hasPath(/(^|\/)(src\/)?app\/layout\.(js|jsx|ts|tsx)$/) ||
    hasPath(/(^|\/)(src\/)?app\/page\.(js|jsx|ts|tsx)$/) ||
    hasPath(/(^|\/)next-env\.d\.ts$/)
  ) {
    return "next";
  }

  if (
    hasPath(/(^|\/)vite\.config\./) ||
    hasPath(/(^|\/)src\/main\.(js|jsx|ts|tsx)$/) ||
    hasPath(/(^|\/)src\/vite-env\.d\.ts$/)
  ) {
    return "vite";
  }

  if (
    hasPath(/(^|\/)index\.html$/) &&
    hasPath(/(^|\/)src\/main\.(js|jsx|ts|tsx)$/)
  ) {
    return "vite";
  }

  if (
    hasPath(/(^|\/)index\.html$/) ||
    hasPath(/\.(js|mjs|cjs|css)$/)
  ) {
    return "javascript";
  }

  return null;
}

const Nextjs = (props: SVGProps<SVGSVGElement>) => {
  const uid = useId().replace(/:/g, "");
  const maskId = `nextjs_mask_${uid}`;
  const paint0Id = `nextjs_paint0_${uid}`;
  const paint1Id = `nextjs_paint1_${uid}`;

  return (
    <svg {...props} viewBox="0 0 180 180" aria-hidden="true">
      <mask
        height="180"
        id={maskId}
        maskUnits="userSpaceOnUse"
        width="180"
        x="0"
        y="0"
        style={{ maskType: "alpha" }}
      >
        <circle cx="90" cy="90" fill="black" r="90" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <circle cx="90" cy="90" data-circle="true" fill="black" r="90" />
        <path
          d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.165 149.508 157.52Z"
          fill={`url(#${paint0Id})`}
        />
        <rect
          fill={`url(#${paint1Id})`}
          height="72"
          width="12"
          x="115"
          y="54"
        />
      </g>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={paint0Id}
          x1="109"
          x2="144.5"
          y1="116.5"
          y2="160.5"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={paint1Id}
          x1="121"
          x2="120.799"
          y1="54"
          y2="106.875"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const Vite = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 256 257" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="vite_a" x1="6" x2="235" y1="33" y2="344" gradientUnits="userSpaceOnUse">
        <stop stopColor="#41D1FF" />
        <stop offset="1" stopColor="#BD34FE" />
      </linearGradient>
      <linearGradient id="vite_b" x1="194.651" x2="236.076" y1="8.818" y2="292.989" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFEA83" />
        <stop offset=".083" stopColor="#FFDD35" />
        <stop offset="1" stopColor="#FFA800" />
      </linearGradient>
    </defs>
    <path d="M255.153 37.938L134.897 252.567c-2.486 4.44-8.857 4.466-11.38.048L.844 37.958c-2.75-4.812 1.36-10.62 6.83-9.657l120.4 21.205a6.52 6.52 0 0 0 2.258 0l117.99-21.177c5.463-.98 9.584 4.805 6.832 9.61Z" fill="url(#vite_a)" />
    <path d="M185.432.063 96.44 17.501a3.26 3.26 0 0 0-2.623 2.772L88.34 112.49a3.26 3.26 0 0 0 3.878 3.427l24.772-5.72a3.26 3.26 0 0 1 3.94 3.834l-7.36 36.036a3.26 3.26 0 0 0 4.103 3.79l15.3-4.71a3.26 3.26 0 0 1 4.14 4.047l-11.697 56.78c-.732 3.56 4 5.502 5.96 2.445l1.31-2.043 72.512-144.767c1.215-2.426-.881-5.146-3.552-4.634l-25.5 4.914a3.26 3.26 0 0 1-3.757-4.107l16.64-57.67A3.26 3.26 0 0 0 185.431.063Z" fill="url(#vite_b)" />
  </svg>
);

const JavaScript = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 1052 1052" aria-hidden="true">
    <path fill="#f0db4f" d="M0 0h1052v1052H0z" />
    <path
      d="M965.9 801.1c-7.7-48-39-88.3-131.7-125.9-32.2-14.8-68.1-25.399-78.8-49.8-3.8-14.2-4.3-22.2-1.9-30.8 6.9-27.9 40.2-36.6 66.6-28.6 17 5.7 33.1 18.801 42.8 39.7 45.4-29.399 45.3-29.2 77-49.399-11.6-18-17.8-26.301-25.4-34-27.3-30.5-64.5-46.2-124-45-10.3 1.3-20.699 2.699-31 4-29.699 7.5-58 23.1-74.6 44-49.8 56.5-35.6 155.399 25 196.1 59.7 44.8 147.4 55 158.6 96.9 10.9 51.3-37.699 67.899-86 62-35.6-7.4-55.399-25.5-76.8-58.4-39.399 22.8-39.399 22.8-79.899 46.1 9.6 21 19.699 30.5 35.8 48.7 76.2 77.3 266.899 73.5 301.1-43.5 1.399-4.001 10.6-30.801 3.199-72.101zm-394-317.6h-98.4c0 85-.399 169.4-.399 254.4 0 54.1 2.8 103.7-6 118.9-14.4 29.899-51.7 26.2-68.7 20.399-17.3-8.5-26.1-20.6-36.3-37.699-2.8-4.9-4.9-8.7-5.601-9-26.699 16.3-53.3 32.699-80 49 13.301 27.3 32.9 51 58 66.399 37.5 22.5 87.9 29.4 140.601 17.3 34.3-10 63.899-30.699 79.399-62.199 22.4-41.3 17.6-91.3 17.4-146.6.5-90.2 0-180.4 0-270.9z"
      fill="#323330"
    />
  </svg>
);
