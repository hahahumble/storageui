import "server-only"

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/**
 * The site key, or `null` when the challenge is off.
 *
 * Read at request time and handed to the client as a prop rather than through a
 * `NEXT_PUBLIC_` variable: those are inlined at build time, and the published
 * Docker image is built before anyone's keys exist. The site key is not secret.
 */
export function turnstileSiteKey(): string | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (siteKey && secretKey) return siteKey

  if (siteKey || secretKey) {
    console.warn(
      "Turnstile needs both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY. Only one is set, so the challenge stays off."
    )
  }
  return null
}

/**
 * Whether this token clears the challenge. Always true when Turnstile is not
 * configured; a failure to reach Cloudflare counts as a failure, so an
 * unreachable verifier cannot be used to skip the challenge.
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!turnstileSiteKey() || !secret) return true
  if (!token) return false

  const body = new FormData()
  body.append("secret", secret)
  body.append("response", token)

  try {
    const response = await fetch(VERIFY_URL, { method: "POST", body })
    const result = (await response.json()) as { success?: boolean }
    return result.success === true
  } catch {
    return false
  }
}
