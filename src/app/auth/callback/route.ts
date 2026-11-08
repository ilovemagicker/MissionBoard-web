import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { sanitizeNextPath } from "@/lib/deep-links";
import {
  classifyLinkGoogleError,
  linkErrorQueryValue,
} from "@/lib/link-google-errors";

function settingsLinkErrorRedirect(
  origin: string,
  code: ReturnType<typeof classifyLinkGoogleError>
) {
  const url = new URL("/app/settings", origin);
  url.searchParams.set("link_error", linkErrorQueryValue(code));
  url.hash = "account";
  return NextResponse.redirect(url.toString());
}

function isLinkFlow(flow: string | null, next: string): boolean {
  if (flow === "link") return true;
  try {
    const u = new URL(next, "https://example.invalid");
    return u.searchParams.has("link") || u.searchParams.has("link_error");
  } catch {
    return next.includes("link=");
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const flow = searchParams.get("flow");
  const oauthError = searchParams.get("error");
  const oauthDescription =
    searchParams.get("error_description") ?? searchParams.get("error_code");
  const next = sanitizeNextPath(searchParams.get("next"));
  const linking = isLinkFlow(flow, next);

  if (!isSupabaseConfigured()) {
    if (linking) {
      return settingsLinkErrorRedirect(origin, "failed");
    }
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  // Provider / GoTrue returned an error before issuing a code (common on link conflicts).
  if (oauthError) {
    const classified = classifyLinkGoogleError(
      `${oauthError} ${oauthDescription ?? ""}`
    );
    if (linking) {
      return settingsLinkErrorRedirect(origin, classified);
    }
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Successful link or sign-in: honor `next` (settings?link=ok for link flow).
      return NextResponse.redirect(`${origin}${next}`);
    }
    if (linking) {
      return settingsLinkErrorRedirect(
        origin,
        classifyLinkGoogleError(error.message)
      );
    }
  }

  if (linking) {
    return settingsLinkErrorRedirect(origin, "failed");
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
