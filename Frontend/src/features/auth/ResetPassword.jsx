import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "../../shared/api/endpoints.js";
import { AuthShell } from "./Login.jsx";
import Button from "../../shared/components/Button.jsx";
import Input from "../../shared/components/Input.jsx";

const schema = z.object({
  password: z.string().min(8, "At least 8 characters"),
});

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [err, setErr] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }) => {
    try {
      await authApi.resetPassword(token, password);
      nav("/login", { replace: true });
    } catch (e) {
      setErr(e.response?.data?.message || "Reset failed");
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid reset link">
        <p className="text-sm text-slate-600">
          The reset link is missing its token.{" "}
          <Link to="/forgot-password" className="font-medium text-slate-800">
            Request a new one
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        {err ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {err}
          </div>
        ) : null}
        <Button type="submit" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
