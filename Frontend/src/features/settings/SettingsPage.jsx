import { Link } from "react-router-dom";
import { useAuth } from "../../store/authStore.js";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage account security and preferences.
      </p>

      <section className="mt-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Account</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="text-slate-800">{user?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="text-slate-800">{user?.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Role</dt>
            <dd className="text-slate-800 capitalize">{user?.role || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Security</h2>
        <p className="mt-1 text-xs text-slate-500">
          Update your password from the password reset flow.
        </p>
        <Link
          to="/forgot-password"
          className="mt-3 inline-block text-sm font-medium text-slate-800 hover:underline"
        >
          Change password
        </Link>
      </section>
    </div>
  );
}
