import { z } from "zod";
import { bookingStatuses } from "./domain";

export const pageSizes = [10,20,50] as const;
export const workspaceSections = ["overview","bookings","notifications","requests","providers","users","payments","reviews","services","addresses","availability","settings"] as const;
export type PageList = "bookings" | "notifications" | "requests" | "providers" | "accounts" | "payments" | "unpaid" | "reviews" | "pendingReviews";
export type PageInfo = { page: number; pageSize: number; total: number; totalPages: number; ids?: string[] };
export const workspaceOptionsSchema = z.object({
  section: z.enum(workspaceSections).default("overview"),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().refine(n => pageSizes.includes(n as 10),"Choose a page size of 10, 20, or 50.").default(10),
  pendingPage: z.coerce.number().int().min(1).max(1000000).default(1),
  status: z.enum(["all",...bookingStatuses]).default("all"),
  q: z.string().trim().max(100).default(""),
  bookingId: z.uuid().optional(),
});
export type WorkspaceOptions = z.infer<typeof workspaceOptionsSchema>;
export function parseWorkspaceOptions(params: URLSearchParams): WorkspaceOptions {
  const values: Record<string,string> = {};
  for (const key of Object.keys(workspaceOptionsSchema.shape)) {
    const entries = params.getAll(key);
    if (entries.length > 1) throw new z.ZodError([{ code: "custom", path: [key], message: `Supply ${key} only once.` }]);
    if (entries.length) values[key] = entries[0];
  }
  return workspaceOptionsSchema.parse(values);
}
export function pageInfo(total: number, requestedPage = 1, pageSize = 10): PageInfo {
  const totalPages = Math.max(1,Math.ceil(total / pageSize));
  return { page: Math.min(Math.max(1,requestedPage),totalPages), pageSize, total, totalPages };
}
export function paginate<T>(items: T[], requestedPage = 1, pageSize = 10) {
  const pagination = pageInfo(items.length,requestedPage,pageSize);
  return { items: items.slice((pagination.page - 1) * pageSize,pagination.page * pageSize), pagination };
}
export function pageOffset(info: PageInfo) { return (info.page - 1) * info.pageSize; }
export function pageHref(path: string, params: URLSearchParams, info: PageInfo, page: number, key = "page", size = info.pageSize) {
  const next = new URLSearchParams(params);
  if (page === 1) next.delete(key); else next.set(key,String(page));
  if (size !== info.pageSize) { next.delete("page"); next.delete("pendingPage"); }
  if (size === 10) next.delete("pageSize"); else next.set("pageSize",String(size));
  const query = next.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
