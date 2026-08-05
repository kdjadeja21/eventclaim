import SettingsClient from "./settings-client";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure the Luma and EmailJS integrations used by this app.
        </p>
      </div>

      <SettingsClient />
    </div>
  );
}
