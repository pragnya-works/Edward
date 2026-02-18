import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <h2 className="text-base font-semibold text-foreground mb-2">Changelog Not Found</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            This changelog resource is currently unavailable.
          </p>
          <Link
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go Home
          </Link>
        </div>
      </div>
    </main>
  );
}
