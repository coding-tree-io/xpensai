"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<
    "google" | "github" | "email" | null
  >(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSocialSignUp = async (provider: "google" | "github") => {
    setErrorMessage(null);
    await authClient.signIn.social(
      { provider },
      {
        onRequest: () => setIsLoading(provider),
        onResponse: () => setIsLoading(null),
        onSuccess: () => router.push("/"),
        onError: (ctx) => {
          setIsLoading(null);
          setErrorMessage(ctx.error.message);
        },
      }
    );
  };

  const handleEmailSignUp = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    await authClient.signUp.email(
      { name, email, password },
      {
        onRequest: () => setIsLoading("email"),
        onResponse: () => setIsLoading(null),
        onSuccess: () => router.push("/"),
        onError: (ctx) => {
          setIsLoading(null);
          setErrorMessage(ctx.error.message);
        },
      }
    );
  };

  return (
    <Card className="w-full max-w-md bg-card/90">
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Use email or a social account to sign up.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={handleEmailSignUp}>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex Parker"
              autoComplete="name"
              required
              disabled={isLoading !== null}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
              disabled={isLoading !== null}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a strong password"
              autoComplete="new-password"
              required
              disabled={isLoading !== null}
            />
          </div>
          <Button className="w-full" type="submit" disabled={isLoading !== null}>
            Sign up with email
          </Button>
        </form>
        {errorMessage ? (
          <p className="text-sm text-red-400">{errorMessage}</p>
        ) : null}
        <Button
          className="w-full"
          variant="outline"
          onClick={() => handleSocialSignUp("google")}
          disabled={isLoading !== null}
        >
          Sign up with Google
        </Button>
        <Button
          className="w-full"
          variant="outline"
          onClick={() => handleSocialSignUp("github")}
          disabled={isLoading !== null}
        >
          Sign up with GitHub
        </Button>
        <Button
          className="w-full"
          variant="ghost"
          onClick={() => router.push("/sign-in")}
        >
          Already have an account? Sign in
        </Button>
      </CardContent>
    </Card>
  );
}
