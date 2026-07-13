// Sign-up field rules, iisang source of truth para sa form (inline UX) at sa
// data layer (ang totoong gate). Isang lugar lang para hindi mag-drift ang
// front-end at backend kapag nag-Supabase na sa Phase 2.

/** Letters, space, at basic name marks lang (Dela Cruz, O'Brien, Jr.). Walang numero. */
const NAME_PATTERN = /^[\p{L} '.-]+$/u

/** Special character = kahit anong hindi letra, hindi numero, at hindi space. */
const SPECIAL_CHAR = /[^\p{L}\p{N}\s]/u

export const MIN_PASSWORD_LENGTH = 6
export const MAX_PASSWORD_LENGTH = 128
export const MAX_FULL_NAME_LENGTH = 80

/**
 * Suriin ang pangalan sa sign-up. Nagbabalik ng error message kapag mali, o
 * `null` kapag okay na. Letters lang ang pinapayagan, bawal ang numero.
 */
export function validateFullName(raw: string): string | null {
  const name = raw.trim()
  if (!name) return 'Pakilagay ang pangalan.'
  if (name.length > MAX_FULL_NAME_LENGTH) return `Hanggang ${MAX_FULL_NAME_LENGTH} character lang ang pangalan.`
  if (/\p{N}/u.test(name)) return 'Bawal maglagay ng numero sa pangalan.'
  if (!NAME_PATTERN.test(name)) return 'Letters lang ang pangalan (walang numero o simbolo).'
  return null
}

/**
 * Suriin ang password sa sign-up: kailangan may sapat na haba AT kahit isang
 * special character. Nagbabalik ng error message o `null`.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Kailangan man lang ${MIN_PASSWORD_LENGTH} na character ang password.`
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Hanggang ${MAX_PASSWORD_LENGTH} character lang ang password.`
  }
  if (!SPECIAL_CHAR.test(password)) {
    return 'Magdagdag ng special character sa password (hal. ! @ # $ %).'
  }
  return null
}
