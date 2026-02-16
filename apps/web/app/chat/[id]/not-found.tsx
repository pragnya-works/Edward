import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="mb-2 text-base font-semibold text-foreground">Conversation Not Found</h2>
      <p className="mb-5 max-w-md text-sm text-muted-foreground">
        This conversation may have been removed or you may not have access.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go Home
      </Link>
    </div>
  );
}
