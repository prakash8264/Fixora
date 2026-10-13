import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import type { WorkspaceData, WorkspaceStats } from "../types";
import { listOpenRequests } from "./bookings";
import { serializeSchedule } from "../scheduling";
import { pageInfo, pageOffset, workspaceOptionsSchema, type PageList, type WorkspaceOptions, type PageInfo } from "../pagination";
import { ApiError } from "./http";

export async function getWorkspace(user: typeof t.users.$inferSelect, input?: Partial<WorkspaceOptions>): Promise<WorkspaceData> {
  const options = input ? workspaceOptionsSchema.parse(input) : undefined;
  if (options && ((["providers","users"].includes(options.section) && user.role !== "admin") || (options.section === "requests" && user.role !== "provider"))) throw new ApiError(403,"This list is not available to your account.");
  return getDb().transaction(async db => {
    const where = user.role === "admin" ? undefined : user.role === "customer" ? eq(t.bookings.customerId,user.id) : eq(t.bookings.providerId,user.id);
    const pages: Partial<Record<PageList,PageInfo>> = {};
    const page = (key: PageList, total: number, pending = false) => pages[key] = pageInfo(total,pending ? options?.pendingPage : options?.page,options?.pageSize);
    const captured = sql`exists (select 1 from payments p where p.booking_id = ${t.bookings.id} and p.status = 'captured')`;
    const unpaidWhere = and(where,sql`${t.bookings.status} in ('completed','inspection_completed') and not ${captured}`);
    const pendingReviewWhere = and(where,eq(t.bookings.status,"completed"),captured,sql`not exists (select 1 from reviews r where r.booking_id = ${t.bookings.id})`);
    const paymentWhere = and(where,eq(t.payments.status,"captured"));
    let historyPayments: typeof t.payments.$inferSelect[] | undefined;
    let historyReviews: typeof t.reviews.$inferSelect[] | undefined;
    let relatedIds: string[] | undefined;
    if (options?.section === "payments") {
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(t.payments).innerJoin(t.bookings,eq(t.bookings.id,t.payments.bookingId)).where(paymentWhere);
      const info = page("payments",count.total);
      historyPayments = (await db.select({ row: t.payments }).from(t.payments).innerJoin(t.bookings,eq(t.bookings.id,t.payments.bookingId)).where(paymentWhere).orderBy(desc(t.payments.createdAt),desc(t.payments.id)).limit(info.pageSize).offset(pageOffset(info))).map(r => r.row);
      const [pendingCount] = await db.select({ total: sql<number>`count(*)::int` }).from(t.bookings).where(unpaidWhere);
      const pending = page("unpaid",pendingCount.total,true);
      const unpaidRows = await db.select({ id: t.bookings.id }).from(t.bookings).where(unpaidWhere).orderBy(desc(t.bookings.createdAt),desc(t.bookings.id)).limit(pending.pageSize).offset(pageOffset(pending));
      pending.ids = unpaidRows.map(r => r.id);
      relatedIds = [...historyPayments.map(p => p.bookingId),...pending.ids];
    }
    if (options?.section === "reviews") {
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(t.reviews).innerJoin(t.bookings,eq(t.bookings.id,t.reviews.bookingId)).where(where);
      const info = page("reviews",count.total);
      historyReviews = (await db.select({ row: t.reviews }).from(t.reviews).innerJoin(t.bookings,eq(t.bookings.id,t.reviews.bookingId)).where(where).orderBy(desc(t.reviews.createdAt),desc(t.reviews.id)).limit(info.pageSize).offset(pageOffset(info))).map(r => r.row);
      if (user.role === "customer") {
        const [pendingCount] = await db.select({ total: sql<number>`count(*)::int` }).from(t.bookings).where(pendingReviewWhere);
        const pending = page("pendingReviews",pendingCount.total,true);
        pending.ids = (await db.select({ id: t.bookings.id }).from(t.bookings).where(pendingReviewWhere).orderBy(desc(t.bookings.createdAt),desc(t.bookings.id)).limit(pending.pageSize).offset(pageOffset(pending))).map(r => r.id);
      }
      relatedIds = [...historyReviews.map(r => r.bookingId),...(pages.pendingReviews?.ids ?? [])];
    }
    const escapedSearch = options?.q.replace(/[\\%_]/g,"\\$&") ?? "";
    const bookingWhere = and(where,options?.bookingId ? eq(t.bookings.id,options.bookingId) : relatedIds ? inArray(t.bookings.id,relatedIds) : options?.section === "bookings" ? and(options.status !== "all" ? eq(t.bookings.status,options.status) : undefined,escapedSearch ? or(sql`${t.bookings.reference} ilike ${`%${escapedSearch}%`}`,sql`${t.bookings.serviceNameSnapshot} ilike ${`%${escapedSearch}%`}`,sql`${t.users.name} ilike ${`%${escapedSearch}%`}`) : undefined) : undefined);
    let bookingPage: PageInfo | undefined;
    if (options?.section === "bookings" && !options.bookingId) {
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(t.bookings).innerJoin(t.users,eq(t.users.id,t.bookings.customerId)).where(bookingWhere);
      bookingPage = page("bookings",count.total);
    }
    // ponytail: offset pagination with deterministic ordering; switch to cursors if deep offsets become slow.
    const bookingLimit = options?.bookingId ? 1 : bookingPage?.pageSize ?? relatedIds?.length ?? (options ? options.section === "overview" ? 4 : options.section === "settings" ? 1 : 0 : 200);
    const rows = await db.select({ booking: t.bookings, customerName: t.users.name }).from(t.bookings).innerJoin(t.users,eq(t.users.id,t.bookings.customerId)).where(bookingWhere).orderBy(desc(t.bookings.createdAt),desc(t.bookings.id)).limit(bookingLimit).offset(bookingPage ? pageOffset(bookingPage) : 0);
    if (options?.bookingId && !rows.length) throw new ApiError(404,"Booking not found or no longer assigned to you.");
    if (options?.section === "overview" && !options.bookingId) {
      const [nextVisit] = await db.select({ booking: t.bookings, customerName: t.users.name }).from(t.bookings).innerJoin(t.users,eq(t.users.id,t.bookings.customerId)).where(and(where,sql`${t.bookings.status} not in ('requested','completed','inspection_completed','cancelled')`)).orderBy(t.bookings.arrivalAt,t.bookings.id).limit(1);
      if (nextVisit && !rows.some(r => r.booking.id === nextVisit.booking.id)) rows.push(nextVisit);
    }
    const ids = rows.map(r => r.booking.id);
    let noticesPage: PageInfo | undefined;
    let providersPage: PageInfo | undefined;
    let accountsPage: PageInfo | undefined;
    if (options?.section === "notifications") {
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(t.notifications).where(eq(t.notifications.recipientId,user.id));
      noticesPage = page("notifications",count.total);
    }
    if (options?.section === "providers") {
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(t.providerProfiles);
      providersPage = page("providers",count.total);
    }
    if (options?.section === "users") {
      const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(t.users);
      accountsPage = page("accounts",count.total);
    }
    const requestPaging: { page: number; pageSize: number; result?: PageInfo } | undefined = options && user.role === "provider" ? { page: options.section === "requests" ? options.page : 1, pageSize: options.pageSize } : undefined;
    const [catalog, addresses, requests, notices, providerRows, accounts] = await Promise.all([
      db.select({ service: t.services, category: t.serviceCategories }).from(t.services).innerJoin(t.serviceCategories,eq(t.serviceCategories.id,t.services.categoryId)),
      user.role === "customer" ? db.select().from(t.addresses).where(eq(t.addresses.customerId,user.id)).orderBy(desc(t.addresses.isDefault),t.addresses.createdAt) : [],
      user.role === "provider" ? listOpenRequests(db,user.id,requestPaging) : [],
      db.select().from(t.notifications).where(eq(t.notifications.recipientId,user.id)).orderBy(desc(t.notifications.createdAt),desc(t.notifications.id)).limit(noticesPage?.pageSize ?? (options ? 5 : 200)).offset(noticesPage ? pageOffset(noticesPage) : 0),
      db.select({ profile: t.providerProfiles, name: t.users.name, suspended: t.users.suspended }).from(t.providerProfiles).innerJoin(t.users,eq(t.users.id,t.providerProfiles.userId)).where(user.role === "admin" && (!options || providersPage) ? undefined : user.role === "provider" ? eq(t.providerProfiles.userId,user.id) : inArray(t.providerProfiles.userId,rows.flatMap(r => r.booking.providerId ? [r.booking.providerId] : []))).orderBy(sql`case when ${t.providerProfiles.approval} = 'pending' then 0 else 1 end`,desc(t.providerProfiles.createdAt),desc(t.providerProfiles.userId)).limit(providersPage?.pageSize ?? 200).offset(providersPage ? pageOffset(providersPage) : 0),
      user.role === "admin" && (!options || accountsPage) ? db.select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, suspended: t.users.suspended }).from(t.users).orderBy(desc(t.users.createdAt),desc(t.users.id)).limit(accountsPage?.pageSize ?? 200).offset(accountsPage ? pageOffset(accountsPage) : 0) : [],
    ]);
    const reservations = user.role === "provider" && options?.section === "requests" ? await db.select({ id: t.bookings.id, status: t.bookings.status, date: t.bookings.date, slot: t.bookings.slot, scheduleMode: t.bookings.scheduleMode, preferredTime: t.bookings.preferredTime, arrivalAt: t.bookings.arrivalAt, reservedUntil: t.bookings.reservedUntil, visitMinutes: t.bookings.visitMinutes }).from(t.bookings).where(and(where,sql`${t.bookings.status} not in ('completed','inspection_completed','cancelled')`)) : undefined;
    const noticeBookingIds = user.role === "provider" ? new Set((await db.select({ id: t.bookings.id }).from(t.bookings).where(and(where,inArray(t.bookings.id,notices.flatMap(n => n.bookingId ? [n.bookingId] : []))))).map(b => b.id)) : undefined;
    const providerIds = providerRows.map(r => r.profile.userId);
    const [estimates, items, events, payments, reviews, offered, areas, ratings, jobCounts] = await Promise.all([
      db.select().from(t.estimates).where(inArray(t.estimates.bookingId,ids)),
      db.select({ item: t.estimateItems }).from(t.estimateItems).innerJoin(t.estimates,eq(t.estimateItems.estimateId,t.estimates.id)).where(inArray(t.estimates.bookingId,ids)),
      db.select({ event: t.bookingEvents, actorName: t.users.name }).from(t.bookingEvents).innerJoin(t.users,eq(t.users.id,t.bookingEvents.actorId)).where(inArray(t.bookingEvents.bookingId,ids)).orderBy(t.bookingEvents.createdAt),
      historyPayments ?? db.select().from(t.payments).where(and(inArray(t.payments.bookingId,ids),eq(t.payments.status,"captured"))).orderBy(desc(t.payments.createdAt),desc(t.payments.id)),
      historyReviews ?? db.select().from(t.reviews).where(inArray(t.reviews.bookingId,ids)).orderBy(desc(t.reviews.createdAt),desc(t.reviews.id)),
      db.select().from(t.providerServices).where(inArray(t.providerServices.providerId,providerIds)),
      db.select().from(t.providerServiceAreas).where(inArray(t.providerServiceAreas.providerId,providerIds)),
      db.select({ providerId: t.reviews.providerId, rating: sql<number>`coalesce(avg(${t.reviews.rating}),0)::float` }).from(t.reviews).where(inArray(t.reviews.providerId,providerIds)).groupBy(t.reviews.providerId),
      db.select({ providerId: t.bookings.providerId, count: sql<number>`count(*)::int` }).from(t.bookings).where(and(inArray(t.bookings.providerId,providerIds),eq(t.bookings.status,"completed"))).groupBy(t.bookings.providerId),
    ]);
    let stats: WorkspaceStats | undefined;
    if (options) {
      const [bookingCounts] = await db.select({ bookings: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${t.bookings.status} not in ('completed','inspection_completed','cancelled'))::int`, upcoming: sql<number>`count(*) filter (where ${t.bookings.status} not in ('requested','completed','inspection_completed','cancelled'))::int`, completed: sql<number>`count(*) filter (where ${t.bookings.status} = 'completed')::int` }).from(t.bookings).where(where);
      const [paymentCounts] = await db.select({ payments: sql<number>`count(*)::int`, collected: sql<number>`coalesce(sum(${t.payments.amount}),0)::float` }).from(t.payments).innerJoin(t.bookings,eq(t.bookings.id,t.payments.bookingId)).where(paymentWhere);
      const [unpaidCount] = await db.select({ total: sql<number>`count(*)::int` }).from(t.bookings).where(unpaidWhere);
      const [reviewCount] = await db.select({ total: sql<number>`count(*)::int` }).from(t.reviews).innerJoin(t.bookings,eq(t.bookings.id,t.reviews.bookingId)).where(where);
      const [unreadCount] = await db.select({ total: sql<number>`count(*)::int` }).from(t.notifications).where(and(eq(t.notifications.recipientId,user.id),sql`${t.notifications.readAt} is null`));
      const [providerCounts] = user.role === "admin" ? await db.select({ pending: sql<number>`count(*) filter (where ${t.providerProfiles.approval} = 'pending')::int`, approved: sql<number>`count(*) filter (where ${t.providerProfiles.approval} = 'approved')::int` }).from(t.providerProfiles) : [{ pending: 0, approved: 0 }];
      const [busyCount] = user.role === "provider" ? await db.select({ total: sql<number>`count(*)::int` }).from(t.bookings).where(and(where,sql`(${t.bookings.status} in ('on_the_way','inspecting','awaiting_approval','ready_to_start','in_progress') or (${t.bookings.scheduleMode} = 'asap' and ${t.bookings.status} = 'accepted'))`)) : [{ total: 0 }];
      stats = { ...bookingCounts, ...paymentCounts, unpaid: unpaidCount.total, reviews: reviewCount.total, unread: unreadCount.total, requests: requestPaging?.result?.total ?? 0, pendingProviders: providerCounts.pending, approvedProviders: providerCounts.approved, busy: busyCount.total > 0 };
    }
    if (options?.section === "requests" && requestPaging?.result) pages.requests = requestPaging.result;
    return {
      version: 1,
      profile: { name: user.name, email: user.email, phone: user.phone ?? "" },
      services: catalog.filter(r => user.role !== "customer" || (r.service.active && r.category.active) || rows.some(b => b.booking.serviceId === r.service.id)).map(({ service: s, category }) => ({ id: s.id, name: s.name, category: category.name, description: s.description, price: s.basePrice, icon: s.icon, color: s.color, active: s.active && category.active })),
      addresses: addresses.map(a => ({ id: a.id, label: a.label, line: a.line, city: a.city, postalCode: a.postalCode })),
      bookings: rows.map(({ booking: b, customerName }) => ({ ...serializeSchedule(b), id: b.id, reference: b.reference, customerId: b.customerId, customerName, providerId: b.providerId, serviceId: b.serviceId, description: b.description, address: b.addressSnapshot, basePrice: b.basePrice, total: b.total, paymentRule: b.paymentRule, status: b.status, payment: payments.some(p => p.bookingId === b.id) ? "captured" : "unpaid", createdAt: b.createdAt.toISOString() })),
      providers: providerRows.map(({ profile: p, name, suspended }) => ({ id: p.userId, name, initials: name.split(" ").map(n => n[0]).slice(0,2).join(""), bio: p.bio, services: offered.filter(s => s.providerId === p.userId).map(s => s.serviceId), areas: areas.filter(a => a.providerId === p.userId).map(a => a.postalCode), rating: Math.round((ratings.find(r => r.providerId === p.userId)?.rating ?? 0)*10)/10, jobs: jobCounts.find(c => c.providerId === p.userId)?.count ?? 0, status: p.approval, suspended, clockedIn: p.clockedIn, clockChangedAt: p.clockChangedAt?.toISOString(), rejectionReason: p.rejectionReason ?? undefined, experienceYears: p.experienceYears })),
      invitations: requests.map(r => ({ id: r.id, bookingId: r.id, providerId: user.id, status: "pending" })),
      requests,
      reservations: reservations?.map(r => ({ ...serializeSchedule(r), id: r.id, status: r.status })),
      estimates: estimates.map(e => ({ id: e.id, bookingId: e.bookingId, providerId: e.providerId, version: e.version, status: e.status, total: e.total, createdAt: e.createdAt.toISOString(), items: items.filter(({ item }) => item.estimateId === e.id).map(({ item }) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })) })),
      events: events.map(({ event: e, actorName }) => ({ id: e.id, bookingId: e.bookingId, title: e.action.replaceAll("_"," "), actor: e.action === "invitation_declined" ? "An invited provider" : actorName, createdAt: e.createdAt.toISOString() })),
      notifications: notices.map(n => ({ id: n.id, recipientId: n.recipientId, bookingId: n.bookingId ?? undefined, bookingAccessible: noticeBookingIds && n.bookingId ? noticeBookingIds.has(n.bookingId) : undefined, title: n.title, description: n.description, read: !!n.readAt, createdAt: n.createdAt.toISOString() })),
      reviews: reviews.map(r => ({ id: r.id, bookingId: r.bookingId, providerId: r.providerId, rating: r.rating, comment: r.comment ?? "", createdAt: r.createdAt.toISOString() })),
      payments: payments.map(p => ({ id: p.razorpayPaymentId, bookingId: p.bookingId, amount: p.amount, createdAt: (p.capturedAt ?? p.createdAt).toISOString() })),
      accounts,
      pages,
      stats,
      paymentsEnabled: !!process.env.RAZORPAY_KEY_SECRET && !!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_"),
      webhookEnabled: !!process.env.RAZORPAY_WEBHOOK_SECRET,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
