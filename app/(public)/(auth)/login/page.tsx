import { Card } from "@/components/ui/card";
import { GoogleLoginButton } from "./components/google-login-button";
import LoginForm from "./components/LoginForm";

export interface SearchParams {
  error?: string;
  callbackUrl?: string;
}
interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, callbackUrl } = await searchParams;
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 flex items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md p-6 md:p-8 shadow-lg border border-slate-200 dark:border-slate-700 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">
            Welcome to {process.env.NEXT_PUBLIC_APP_NAME}
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm">
            Sign in with your DIU email to continue
          </p>
          {error && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm">
              {error === "AccessDenied"
                ? "You need a DIU email address (@diu.edu.bd or @s.diu.edu.bd) to sign in"
                : "An error occurred during sign in. Please try again."}
            </div>
          )}
        </div>

        <GoogleLoginButton callbackUrl={callbackUrl || "/"} />

        <LoginForm />

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>Only DIU email addresses are allowed to sign in</p>
          <p className="mt-2">(@diu.edu.bd or @s.diu.edu.bd)</p>
        </div>

        <div className="mt-6 text-center text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Don&apos;t have an account?{" "}
            <a
              href="/register"
              className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Register here
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}
