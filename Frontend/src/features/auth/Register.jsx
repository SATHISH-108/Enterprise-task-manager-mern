import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "react-toastify";
import { useAuth } from "../../store/authStore.js";
import { AuthShell } from "./Login.jsx";
import Button from "../../shared/components/Button.jsx";
import Input from "../../shared/components/Input.jsx";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(["user", "admin"]).optional(),
});

export default function Register() {
  const { register: doRegister, error } = useAuth();
  const nav = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { role: "user" } });

  const onSubmit = async (values) => {
    try {
      await doRegister(values);
      toast.success("Account created. Please sign in.");
      nav("/login", { replace: true });
    } catch {
      /* store.error will show */
    }
  };

  return (
    <AuthShell title="Create your account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input label="Name" error={errors.name?.message} {...register("name")} />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Role
          </span>
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            {...register("role")}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>
      <div className="mt-4 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link className="font-medium text-slate-800" to="/login">
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
