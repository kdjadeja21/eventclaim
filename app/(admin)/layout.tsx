import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminNav from "@/components/admin-nav";
import { AppSettingsProvider } from "@/lib/use-app-settings";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppSettingsProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50/80">
        <AdminNav userEmail={session.email} />
        <main className="flex-1 overflow-y-auto">
          <div className="container max-w-7xl mx-auto p-6">{children}</div>
        </main>
      </div>
    </AppSettingsProvider>
  );
}
