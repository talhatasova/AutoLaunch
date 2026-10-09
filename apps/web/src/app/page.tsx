import { redirect } from "next/navigation";

// The app has no landing page; the marketing site lives in apps/marketing.
// /dashboard sends signed-out visitors to /auth/sign-in.
export default function Index() {
  redirect("/dashboard");
}
