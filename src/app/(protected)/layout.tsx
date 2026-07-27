import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: proxy.ts already redirects unauthenticated requests
  // away from these routes, but a Server Component should never trust that
  // alone for anything sensitive.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium whitespace-nowrap">
            Watchlist
          </Link>
          <Link href="/settings" className="text-sm font-medium whitespace-nowrap">
            Settings
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="truncate text-sm text-zinc-500 max-w-[40vw] sm:max-w-none">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col overflow-x-hidden p-4 sm:p-6">{children}</main>
    </div>
  );
}
