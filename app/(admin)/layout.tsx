import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminNav from "@/components/admin-nav";
import SiteCreditFooter from "@/components/site-credit-footer";
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
      <div className="flex h-screen overflow-hidden bg-background">
        <AdminNav userEmail={session.email} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto flex min-h-full max-w-7xl flex-col p-6">
            <div className="flex-1">{children}</div>
            <SiteCreditFooter tone="light" />
          </div>
        </main>
      </div>
    </AppSettingsProvider>
  );
}
