import type { Metadata } from "next";

// The page itself is a client component, so its title lives here.
export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordLayout({ children }: LayoutProps<"/forgot-password">) {
  return children;
}
