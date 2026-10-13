"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="grid min-h-screen place-items-center p-6"><div className="soft-card p-8"><h1 className="page-heading">Something needs a little care.</h1><p className="my-4 text-sm text-muted-foreground">We couldn’t load this page. Your saved bookings have not been changed.</p><Button onClick={reset}>Try again</Button></div></main>; }
