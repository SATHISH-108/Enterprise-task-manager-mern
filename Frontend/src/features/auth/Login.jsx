import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../../store/authStore.js";
import Button from "../../shared/components/Button.jsx";
import Input from "../../shared/components/Input.jsx";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default function Login() {
  const { login, error } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    try {
      await login(values);
      nav(loc.state?.from?.pathname || "/", { replace: true });
    } catch {
      /* errors handled via store.error */
    }
  };

  return (
    <AuthShell title="Sign in to your workspace">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <Button type="submit" loading={isSubmitting} className="w-full">
          Continue
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-xs text-slate-500">
        <Link className="hover:text-slate-800" to="/forgot-password">
          Forgot password?
        </Link>
        <Link className="hover:text-slate-800" to="/register">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, children }) {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-center text-lg font-semibold text-slate-900">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
