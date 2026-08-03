import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        if (path.startsWith("/login")) return true;
        if (path.startsWith("/api/auth")) return true;
        if (path.startsWith("/app") || path.startsWith("/api/workspace")) {
          return !!token;
        }
        return true;
      },
    },
  }
);

export const config = {
  matcher: ["/app/:path*", "/api/workspace"],
};
