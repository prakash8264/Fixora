"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "./ui/button";
import { pageHref, pageSizes, type PageInfo } from "@/lib/pagination";

export function PaginationControls({ info, href, onPage, onSize, label = "records" }: { info: PageInfo; href?: (page: number) => string; onPage?: (page: number) => void; onSize: (size: number) => void; label?: string }) {
  const start = info.total ? (info.page - 1) * info.pageSize + 1 : 0;
  const end = Math.min(info.page * info.pageSize,info.total);
  const control = (page: number, text: string, disabled: boolean) => {
    const child = <>{text === "Previous" && <ChevronLeft size={14}/>}<span>{text}</span>{text === "Next" && <ChevronRight size={14}/>}</>;
    return href && !disabled ? <Link scroll={false} href={href(page)} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`${text} page of ${label}`}>{child}</Link> : <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onPage?.(page)} aria-label={`${text} page of ${label}`}>{child}</Button>;
  };
  return <nav aria-label={`${label} pagination`} className="my-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-background/40 p-4"><p role="status" aria-live="polite" className="text-[11px] text-muted-foreground">Showing {start}–{end} of {info.total} {label}</p><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-[11px] text-muted-foreground">Per page<select aria-label={`${label} per page`} className="h-9 rounded-lg border bg-background px-2 text-xs text-foreground" value={info.pageSize} onChange={e => onSize(Number(e.target.value))}>{pageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>{control(info.page - 1,"Previous",info.page === 1)}<span aria-current="page" className="text-[11px] font-medium">Page {info.page} of {info.totalPages}</span>{control(info.page + 1,"Next",info.page >= info.totalPages)}</div></nav>;
}
export function ListPagination({ info, label, pageKey = "page" }: { info?: PageInfo; label: string; pageKey?: string }) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  if (!info) return null;
  const url = (page: number, size = info.pageSize) => pageHref(path,new URLSearchParams(params.toString()),info,page,pageKey,size);
  return <PaginationControls info={info} label={label} href={page => url(page)} onSize={size => router.replace(url(1,size),{ scroll: false })}/>;
}
