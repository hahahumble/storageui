import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import {
  isAuthEnabled,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/core"
import { turnstileSiteKey } from "@/lib/auth/turnstile"
import { siteConfig } from "@/lib/config/site"
import { LoginForm } from "@/components/auth/login-form"
import { LoginLocaleSwitcher } from "@/components/auth/login-locale-switcher"
import { AppIcon, ExternalLinkIcon } from "@/components/foundations/icons"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login")
  return { title: t("signIn") }
}

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  if (!isAuthEnabled()) redirect("/")

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  if (await verifySessionToken(token)) redirect("/")

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background p-6 pb-16">
      <LoginForm turnstileSiteKey={turnstileSiteKey()} />
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm text-muted-foreground">
        <LoginLocaleSwitcher />
        <span aria-hidden="true">·</span>
        <a
          href={siteConfig.websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Website
          <AppIcon icon={ExternalLinkIcon} className="size-3.5" />
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={siteConfig.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          GitHub
          <AppIcon icon={ExternalLinkIcon} className="size-3.5" />
        </a>
      </div>
    </main>
  )
}
