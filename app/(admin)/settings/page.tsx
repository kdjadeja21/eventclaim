import SettingsClient from "./settings-client";
import PageTourButton from "@/components/tour/page-tour-button";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure the Luma and EmailJS integrations used by this app.
          </p>
        </div>
        <PageTourButton tourId="settings" />
      </div>

      <SettingsClient />
    </div>
  );
}
