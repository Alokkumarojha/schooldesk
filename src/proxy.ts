import { clerkMiddleware } from '@clerk/nextjs/server';

export const proxy = clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf|map)).*)',
    '/(api|trpc)(.*)',
  ],
};
