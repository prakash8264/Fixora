import { Droplets, Hammer, Paintbrush, Snowflake, Sparkles, Zap, Wrench, type LucideIcon } from "lucide-react";
import type { Service } from "@/lib/types";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = { sparkles: Sparkles, droplet: Droplets, zap: Zap, snowflake: Snowflake, paintbrush: Paintbrush, hammer: Hammer };
const colors: Record<string, string> = { mint: "bg-[#dcebe2] text-[#437461]", blue: "bg-[#deebf0] text-[#527c92]", amber: "bg-[#f4ecd8] text-[#a08040]", lavender: "bg-[#e7e3f2] text-[#82749e]", rose: "bg-[#f0e2e1] text-[#a27571]", sand: "bg-[#ebe5db] text-[#8e7c5e]" };
export function ServiceIcon({ service, small = false }: { service?: Service; small?: boolean }) {
  const Icon = icons[service?.icon ?? ""] ?? Wrench;
  return <div className={cn("service-icon shrink-0", colors[service?.color ?? "mint"], small && "size-10! rounded-xl!")}><Icon size={small ? 19 : 24} strokeWidth={1.65} /></div>;
}
