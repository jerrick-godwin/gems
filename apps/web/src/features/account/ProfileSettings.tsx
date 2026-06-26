import { Check } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { UserDashboard } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProfileSettings({
  api,
  dashboard,
  accountError,
  onDashboardChange,
  onMarketplaceRefresh
}: {
  api: GemsApiClient;
  dashboard: UserDashboard | null;
  accountError: string | null;
  onDashboardChange: (dashboard: UserDashboard) => void;
  onMarketplaceRefresh: () => Promise<void>;
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});
  const saveAction = useSingleFlightAction();
  const user = dashboard?.user;
  const emailError = useMemo(() => user ? validateEmail(user.email) : undefined, [user]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const email = user?.email ?? "";
    const nextErrors = validateProfileContact(email, phone);
    const profilePatch = user ? getChangedProfileFields(user, { name, phone, address }) : {};

    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.phone) {
      setSaveState("error");
      setProfileStatus("Please fix the highlighted details.");
      return;
    }

    if (Object.keys(profilePatch).length === 0) {
      setSaveState("saved");
      setProfileStatus("No profile changes to save.");
      return;
    }

    await saveAction.run(async () => {
      setSaveState("saving");
      setProfileStatus(null);
      try {
        await api.updateMe(profilePatch);
        const [nextDashboard] = await Promise.all([api.dashboard(), onMarketplaceRefresh()]);
        onDashboardChange(nextDashboard);
        setFieldErrors({});
        setSaveState("saved");
        setProfileStatus("Profile saved.");
      } catch (error) {
        setSaveState("error");
        setProfileStatus(error instanceof Error ? error.message : "Unable to save profile.");
      }
    });
  };

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>Profile</h1>
        <p>Manage your account details.</p>
      </div>
      {accountError && <div className="empty-results"><h2>Account unavailable</h2><p>{accountError}</p></div>}
      <div className="profile-form-shell">
        <form key={`${user?.id ?? "profile"}-${user?.updatedAt ?? "pending"}`} className="data-panel settings-form" onSubmit={saveProfile}>
          <h2>Profile</h2>
          <div className="settings-grid">
            <label>
              Name
              <input name="name" defaultValue={user?.name ?? ""} />
            </label>
            <label>
              Email
              <input value={user?.email ?? ""} readOnly aria-readonly="true" aria-invalid={Boolean(fieldErrors.email || emailError)} />
              {(fieldErrors.email || emailError) && <span className="field-error">{fieldErrors.email ?? emailError}</span>}
            </label>
            <label>
              Phone
              <input
                name="phone"
                defaultValue={user?.phone ?? ""}
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={Boolean(fieldErrors.phone)}
                onChange={() => setFieldErrors((current) => ({ ...current, phone: undefined }))}
              />
              {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
            </label>
            <label className="settings-field-wide">
              Address
              <textarea name="address" defaultValue={user?.address ?? ""} rows={3} autoComplete="street-address" />
            </label>
          </div>
          <button className="primary-action profile-save-action" type="submit" disabled={saveAction.busy || saveState === "saving" || !user}>
            {saveState === "saving" && <span className="button-spinner" aria-hidden="true" />}
            {saveState === "saved" && <Check size={18} strokeWidth={2.6} aria-hidden="true" />}
            {saveState === "saving" ? "Saving profile..." : saveState === "saved" ? "Profile saved" : "Save profile"}
          </button>
          {profileStatus && saveState !== "saved" && <p className={`profile-status profile-status-${saveState}`}>{profileStatus}</p>}
        </form>
      </div>
    </section>
  );
}

function validateProfileContact(email: string, phone: string) {
  const errors: { email?: string; phone?: string } = {};
  const normalizedPhone = phone.trim();

  errors.email = validateEmail(email);

  const digits = normalizedPhone.replace(/\D/g, "");
  const hasPhoneShape = /^\+?[0-9\s().-]+$/.test(normalizedPhone);
  if (!normalizedPhone || !hasPhoneShape || digits.length < 9 || digits.length > 15) {
    errors.phone = "Enter a valid phone number, for example 0769715227 or +94769715227.";
  }

  return errors;
}

function validateEmail(email: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "A valid account email is required.";
  }
  return undefined;
}

function getChangedProfileFields(
  user: UserDashboard["user"],
  fields: Pick<UserDashboard["user"], "name" | "phone" | "address">
) {
  const patch: Partial<Pick<UserDashboard["user"], "name" | "phone" | "address">> = {};

  if (fields.name !== user.name) patch.name = fields.name;
  if (fields.phone !== user.phone) patch.phone = fields.phone;
  if (fields.address !== user.address) patch.address = fields.address;

  return patch;
}
