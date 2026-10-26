import { redirect } from "next/navigation";

// The app opens on admin sign-in; the proxy sends signed-in admins on to the dashboard.
export default function Home() {
  redirect("/dashboard");
}
