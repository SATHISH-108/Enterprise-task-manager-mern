import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "../../shared/api/endpoints.js";
import { AuthShell } from "./Login.jsx";
import Button from "../../shared/components/Button.jsx";
import Input from "../../shared/components/Input.jsx";

const schema = z.object({ email: z.string().email() });

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }) => {
    await authApi.forgotPassword(email);
    setSent(true);
  };

  return (
    <AuthShell title="Reset your password">
      {sent ? (
        <p className="text-sm text-slate-600">
          If an account exists for that email, we've sent a reset link. Check
          your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <div className="mt-4 text-center text-xs text-slate-500">
        <Link to="/login" className="font-medium text-slate-800">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
