import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the login session and tells us who (if anyone) is signed in.
  const { data } = await supabase.auth.getUser();
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  const isOwner = !!data.user && data.user.email?.toLowerCase() === allowed;

  if (request.nextUrl.pathname.startsWith("/vault") && !isOwner) {
    const login = new URL("/login", request.url);
    // Signed in, but not as the vault's owner: say so on the login page instead of failing silently.
    if (data.user) login.searchParams.set("denied", "1");
    return NextResponse.redirect(login);
  }

  return response;
}

// Only the vault needs the login check, so the public portfolio works without Supabase set up.
export const config = {
  matcher: ["/vault/:path*"],
};
