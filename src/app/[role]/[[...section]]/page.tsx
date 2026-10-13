import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Workspace } from "@/components/workspace";
import { roles, type Role } from "@/lib/domain";
import { LiveSetup } from "@/components/live-setup";
import { requireUser } from "@/lib/server/auth";
import { WorkspaceSessionProvider } from "@/components/workspace-session";
import { ApiError } from "@/lib/server/http";

const sections: Record<Role, string[]> = {
  customer: ["", "services", "bookings", "addresses", "payments", "reviews", "notifications", "settings"],
  provider: ["", "requests", "bookings", "availability", "payments", "reviews", "notifications", "settings"],
  admin: ["", "providers", "users", "bookings", "services", "payments", "notifications", "settings"],
};

export default async function WorkspacePage({ params }: { params: Promise<{ role: string; section?: string[] }> }) {
  const { role, section } = await params;
  if (!roles.includes(role as Role) || (section?.length ?? 0) > 1 || !sections[role as Role].includes(section?.[0] ?? "")) notFound();
  if (process.env.NEXT_PUBLIC_APP_MODE === "live") {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) return <LiveSetup/>;
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    let user;
    try { user = await requireUser(); }
    catch (error) {
      if (error instanceof ApiError && error.status === 403) return <main className="grid min-h-screen place-items-center p-8"><div className="soft-card max-w-md p-8"><h1 className="page-heading">Account unavailable.</h1><p className="my-4 text-sm text-muted-foreground">This account is suspended. Contact the platform administrator, or use the account menu to sign out.</p><UserButton/></div></main>;
      throw error;
    }
    if (user.role !== role) redirect(`/${user.role}`);
    return <WorkspaceSessionProvider actor={{ id: user.id, role: user.role }}><Suspense fallback={<div className="p-12 text-sm">Getting your workspace ready…</div>}><Workspace role={user.role} section={section?.[0] ?? ""}/></Suspense></WorkspaceSessionProvider>;
  }
  return <Suspense fallback={<div className="p-12 text-sm">Getting your workspace ready…</div>}><Workspace role={role as Role} section={section?.[0] ?? ""}/></Suspense>;
}
