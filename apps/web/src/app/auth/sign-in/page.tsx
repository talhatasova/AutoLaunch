import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="shell grid min-h-[70dvh] items-center gap-12 py-16 lg:grid-cols-2">
      <div>
        <p className="t-micro fg-accent">DirectoryLaunch beta</p>
        <h1 className="t-display-sm fg-heading mt-5 max-w-[12ch] text-[clamp(2.5rem,6vw,5rem)]">
          Your products. Every submission accounted for.
        </h1>
        <p className="fg-body mt-6 max-w-[48ch] leading-relaxed">
          Review your product details, choose verified free directories, and see each result as it happens.
        </p>
      </div>

      <div className="edge-heavy-t edge-b max-w-md py-8 lg:justify-self-end lg:w-full">
        <h2 className="t-meta fg-heading">Sign in</h2>
        <form action="/auth/email" method="post" className="mt-7 space-y-4">
          <div>
            <label htmlFor="email" className="t-micro fg-muted block">Email address</label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="mt-2" />
          </div>
          <Button type="submit" variant="signal" size="lg" className="w-full">Send sign-in link</Button>
        </form>
        {sent && <p role="status" className="t-micro fg-muted mt-4">Check your inbox for a sign-in link.</p>}
        {error && <p role="alert" className="t-micro fg-danger mt-4">Enter a valid email address and try again.</p>}
        <div className="mt-7 flex items-center gap-4"><span className="edge-t flex-1" /><span className="t-micro fg-faint">or</span><span className="edge-t flex-1" /></div>
        <Button asChild variant="outline" size="lg" className="mt-7 w-full">
          <Link href="/auth/google">Continue with Google</Link>
        </Button>
      </div>
    </main>
  );
}
