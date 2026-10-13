import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: "Fixora — A little care for your home",
  description: "Book trusted home services, follow your bookings, and keep your home in good hands.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = <Providers>{children}</Providers>;
  return <html lang="en"><body className={jakarta.variable}>{process.env.NEXT_PUBLIC_APP_MODE === "live" && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/customer" signUpFallbackRedirectUrl="/customer">{content}</ClerkProvider> : content}</body></html>;
}
