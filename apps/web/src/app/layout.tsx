import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { getSession } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TeXPR",
  description: "View and compare the compiled PDFs of LaTeX pull requests on GitHub.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const user = session && { login: session.login, avatarUrl: session.avatarUrl, privateRepos: session.scopes.includes("repo") };

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* useSearchParams needs a Suspense boundary */}
        <Suspense fallback={<div className="h-14 border-b border-zinc-200 dark:border-zinc-800" />}>
          <SiteHeader user={user ?? undefined} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
