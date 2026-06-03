import { useState, type FormEvent } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { UserDashboard, UserSettings } from "@gems/schemas";

export function ProfileSettings({
  api,
  dashboard,
  accountError,
  onDashboardChange
}: {
  api: GemsApiClient;
  dashboard: UserDashboard | null;
  accountError: string | null;
  onDashboardChange: (dashboard: UserDashboard) => void;
}) {
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const user = dashboard?.user;
  const settings = dashboard?.settings;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProfileStatus("Saving profile...");
    try {
      await api.updateMe({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        locale: String(form.get("locale") ?? "en") as "en"
      });
      onDashboardChange(await api.dashboard());
      setProfileStatus("Profile saved.");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Unable to save profile.");
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSettingsStatus("Saving settings...");
    try {
      await api.updateSettings({
        theme: String(form.get("theme") ?? "system") as UserSettings["theme"],
        language: String(form.get("language") ?? "en") as UserSettings["language"],
        dashboardDefaultView: String(form.get("dashboardDefaultView") ?? "buyer") as UserSettings["dashboardDefaultView"],
        notificationsEnabled: form.get("notificationsEnabled") === "on"
      });
      onDashboardChange(await api.dashboard());
      setSettingsStatus("Settings saved.");
    } catch (error) {
      setSettingsStatus(error instanceof Error ? error.message : "Unable to save settings.");
    }
  };

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>Profile and Settings</h1>
        <p>Manage account details, web preferences, and dashboard defaults.</p>
      </div>
      {accountError && <div className="empty-results"><h2>Account unavailable</h2><p>{accountError}</p></div>}
      <div className="two-column">
        <form className="data-panel settings-form" onSubmit={saveProfile}>
          <h2>Profile</h2>
          <div className="settings-grid">
            <label>
              Name
              <input name="name" defaultValue={user?.name ?? ""} />
            </label>
            <label>
              Email
              <input value={user?.email ?? ""} readOnly />
            </label>
            <label>
              Phone
              <input name="phone" defaultValue={user?.phone ?? ""} />
            </label>
            <label>
              Locale
              <select name="locale" defaultValue={user?.locale ?? "en"}>
                <option value="en">English</option>
                <option value="si">Sinhala</option>
                <option value="ta">Tamil</option>
              </select>
            </label>
          </div>
          <button className="primary-action" type="submit">Save profile</button>
          {profileStatus && <p style={{ color: "var(--sage)", fontWeight: 600 }}>{profileStatus}</p>}
        </form>
        <form className="data-panel settings-form" onSubmit={saveSettings}>
          <h2>App and web settings</h2>
          <div className="settings-grid">
            <label>
              Theme
              <select name="theme" defaultValue={settings?.theme ?? "system"}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Language
              <select name="language" defaultValue={settings?.language ?? "en"}>
                <option value="en">English</option>
                <option value="si">Sinhala</option>
                <option value="ta">Tamil</option>
              </select>
            </label>
            <label>
              Dashboard default
              <select name="dashboardDefaultView" defaultValue={settings?.dashboardDefaultView ?? "buyer"}>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
              </select>
            </label>
            <label className="checkbox-label" style={{ gridColumn: "1 / -1" }}>
              <input name="notificationsEnabled" type="checkbox" defaultChecked={settings?.notificationsEnabled ?? true} />
              Notifications enabled
            </label>
          </div>
          <button className="primary-action" type="submit">Save settings</button>
          {settingsStatus && <p style={{ color: "var(--sage)", fontWeight: 600 }}>{settingsStatus}</p>}
        </form>
      </div>
    </section>
  );
}

