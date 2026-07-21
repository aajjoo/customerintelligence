import { withAuth } from "next-auth/middleware";

// Alles außer Login und Auth-Endpunkten erfordert eine Session.
export default withAuth({ pages: { signIn: "/anmelden" } });

export const config = {
  matcher: ["/((?!api/auth|anmelden|_next/static|_next/image|favicon.ico).*)"],
};
