import Link from "next/link";
import { HouseHeart } from "lucide-react";

export default function NotFound() { return <main className="grid min-h-screen place-items-center p-6"><div className="soft-card max-w-md p-9 text-center"><HouseHeart size={36} className="mx-auto mb-5 text-primary"/><h1 className="page-heading">A little off the beaten path.</h1><p className="my-4 text-sm text-muted-foreground">That page doesn’t exist. Let’s get you back home.</p><Link href="/customer" className="inline-block rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white">Back to Fixora</Link></div></main>; }
