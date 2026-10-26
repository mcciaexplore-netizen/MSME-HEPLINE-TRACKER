import { redirect } from "next/navigation";

// The app opens on admin sign-in; middleware sends signed-in admins on to the dashboard.
export default function Home() {
  redirect("/dashboard");
}
