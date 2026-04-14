import { cn } from "../../lib/utils";

export interface AvatarWithInitialsProps {
  avatarDataUrl: string | null;
  displayName: string;
  email: string | null;
  oid: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarWithInitialsProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
};

/**
 * Deterministic non-cryptographic hash of a string to a 32-bit unsigned
 * integer (FNV-1a). Used to derive a stable HSL hue from the user's `oid`
 * so the same user always gets the same fallback avatar color — even across
 * app restarts and machines.
 */
function hashOid(oid: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < oid.length; i++) {
    hash ^= oid.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime, with 32-bit truncation
  }
  return hash >>> 0; // unsigned
}

/**
 * Derive initials for the fallback avatar. Prefers the first character of
 * each of the first two whitespace-separated tokens of `displayName`.
 * Falls back to the first two characters of the email local-part. If both
 * sources are unavailable, renders a literal `?` so the UI never shows
 * an empty circle.
 */
function deriveInitials(displayName: string, email: string | null): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1][0]).toUpperCase();
  }
  if (tokens.length === 1 && tokens[0].length > 0) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    const local = email.split("@")[0] ?? "";
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase();
  }
  return "?";
}

/**
 * Render the signed-in user's profile photo when one is available, or a
 * deterministic initials bubble on a pastel HSL background when not.
 *
 * The background hue is derived from a stable hash of the user's `oid`
 * claim (not `displayName` — users can change their name but the `oid`
 * is immutable), so the color stays constant for a given identity.
 *
 * Used by `agents-profile-tab.tsx` for the Account settings card.
 */
export function AvatarWithInitials({
  avatarDataUrl,
  displayName,
  email,
  oid,
  size = "md",
  className,
}: AvatarWithInitialsProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt={displayName ? `${displayName} profile photo` : "Profile photo"}
        className={cn(
          "rounded-full object-cover border border-border",
          sizeClass,
          className,
        )}
      />
    );
  }

  const initials = deriveInitials(displayName, email);
  const hue = hashOid(oid) % 360;
  // Pastel HSL: moderate saturation, high lightness keeps contrast with
  // the dark initials legible in both light and dark themes.
  const bg = `hsl(${hue}, 60%, 78%)`;

  return (
    <div
      aria-label={
        displayName ? `${displayName} initials avatar` : "Initials avatar"
      }
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-foreground select-none",
        sizeClass,
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}
