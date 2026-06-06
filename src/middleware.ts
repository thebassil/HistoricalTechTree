import { clerkMiddleware } from "@clerk/nextjs/server";

// All routes are public — Clerk just provides auth state.
// The UI uses isSignedIn to show/hide edit controls.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
