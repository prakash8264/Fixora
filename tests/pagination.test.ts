import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServiceRequestCard } from "../src/components/service-request-card";
import { PaginationControls } from "../src/components/list-pagination";
import { pageHref, pageInfo, paginate, parseWorkspaceOptions, workspaceOptionsSchema } from "../src/lib/pagination";
import { getDemoWorkspace } from "../src/lib/demo/pagination";
import { createDemoState, demoCustomerId, demoProviderId } from "../src/lib/demo/seed";
import { requestAvailability, serializeSchedule } from "../src/lib/scheduling";

const customer = { id: demoCustomerId, role: "customer" as const };
const provider = { id: demoProviderId, role: "provider" as const };

test("pagination validates page parameters at the API boundary",() => {
  assert.equal(parseWorkspaceOptions(new URLSearchParams()).pageSize,10);
  assert.equal(parseWorkspaceOptions(new URLSearchParams("page=3&pageSize=50")).page,3);
  for (const query of ["page=0","page=-2","page=2.5","page=NaN","page=1000001","pageSize=500","pageSize=11","page=1&page=2","pendingPage=0","status=unknown","bookingId=not-a-uuid"]) assert.throws(() => parseWorkspaceOptions(new URLSearchParams(query)),query);
});

test("pagination clamps shrinking lists, handles empty lists, and reaches beyond 200 records",() => {
  assert.deepEqual(pageInfo(0,99),{ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const records = Array.from({ length: 215 },(_,i) => i);
  const last = paginate(records,999);
  assert.deepEqual(last.items,[210,211,212,213,214]);
  assert.equal(last.pagination.page,22);
  assert.equal(paginate(records.slice(0,11),22).pagination.page,2);
});

test("page links preserve booking filters and independent pending pages; size changes reset both",() => {
  const params = new URLSearchParams("status=completed&q=tap&page=3&pendingPage=2");
  const info = pageInfo(80,3,10);
  assert.equal(pageHref("/customer/bookings",params,info,4),"/customer/bookings?status=completed&q=tap&page=4&pendingPage=2");
  assert.equal(pageHref("/customer/payments",params,info,3,"pendingPage"),"/customer/payments?status=completed&q=tap&page=3&pendingPage=3");
  assert.equal(pageHref("/customer/bookings",params,info,1,"page",20),"/customer/bookings?status=completed&q=tap&pageSize=20");
});

test("demo booking filtering happens before pagination and totals do not become page totals",() => {
  const state = createDemoState();
  const template = state.bookings.find(b => b.customerId === customer.id)!;
  state.bookings = Array.from({ length: 215 },(_,i) => ({ ...template, id: `paging-${String(i).padStart(3,"0")}`, reference: `PAGING-${i}`, status: i % 2 ? "completed" as const : "cancelled" as const }));
  state.bookings.push({ ...template, id: "other", reference: "PAGING-OTHER", customerId: "another-customer" });
  const data = getDemoWorkspace(state,customer,workspaceOptionsSchema.parse({ section: "bookings", status: "completed", q: "PAGING", page: 11 }));
  assert.equal(data.pages?.bookings?.total,107);
  assert.equal(data.bookings.length,7);
  assert.ok(data.bookings.every(b => b.status === "completed" && b.customerId === customer.id));
  assert.equal(data.stats?.bookings,215);
  assert.equal(state.bookings.length,216,"paginating never mutates the demo store");
});

test("notification pages keep global unread counts and old booking links remain independently loadable",() => {
  const state = createDemoState();
  const booking = state.bookings.find(b => b.customerId === customer.id && b.providerId !== provider.id)!;
  state.notifications = Array.from({ length: 215 },(_,i) => ({ id: `notice-${i}`, recipientId: customer.id, title: "An update", description: "A saved update", read: i !== 0, createdAt: new Date(2026,0,i+1).toISOString(), bookingId: booking.id }));
  const data = getDemoWorkspace(state,customer,workspaceOptionsSchema.parse({ section: "notifications", page: 22 }));
  assert.equal(data.notifications.length,5);
  assert.equal(data.stats?.unread,1);
  assert.equal(data.pages?.notifications?.total,215);
  assert.ok(data.notifications.every(n => n.bookingAccessible));
  const detail = getDemoWorkspace(state,customer,{ ...workspaceOptionsSchema.parse({}), bookingId: booking.id });
  assert.equal(detail.bookings[0].id,booking.id,"demo IDs are not required to be UUIDs");
  assert.throws(() => getDemoWorkspace(state,provider,{ ...workspaceOptionsSchema.parse({}), bookingId: booking.id }));
});

test("payment and review histories paginate independently from pending actions",() => {
  const state = createDemoState();
  const template = state.bookings.find(b => b.customerId === customer.id)!;
  state.bookings = Array.from({ length: 45 },(_,i) => ({ ...template, id: `bill-${i}`, status: "completed", payment: i < 25 ? "captured" : "unpaid" }));
  state.payments = state.bookings.slice(0,25).map((b,i) => ({ id: `pay-${i}`, bookingId: b.id, amount: 100, createdAt: b.createdAt }));
  state.reviews = state.bookings.slice(0,12).map((b,i) => ({ id: `review-${i}`, bookingId: b.id, providerId: demoProviderId, rating: 5, comment: "", createdAt: b.createdAt }));
  let data = getDemoWorkspace(state,customer,workspaceOptionsSchema.parse({ section: "payments", page: 3, pendingPage: 2 }));
  assert.equal(data.payments.length,5);
  assert.equal(data.pages?.unpaid?.ids?.length,10);
  assert.equal(data.pages?.unpaid?.page,2);
  assert.equal(data.stats?.collected,2500);
  data = getDemoWorkspace(state,customer,workspaceOptionsSchema.parse({ section: "reviews", page: 2, pendingPage: 2 }));
  assert.equal(data.reviews.length,2);
  assert.equal(data.pages?.pendingReviews?.total,13);
  assert.equal(data.pages?.pendingReviews?.ids?.length,3);
});

test("provider reservations stay available outside the visible jobs page and still disable conflicting requests",() => {
  const state = createDemoState();
  const data = getDemoWorkspace(state,provider,workspaceOptionsSchema.parse({ section: "bookings", status: "completed" }));
  const scheduled = state.bookings.find(b => b.id === "booking-1048")!;
  assert.ok(!data.bookings.some(b => b.id === scheduled.id));
  assert.ok(data.reservations?.some(b => b.id === scheduled.id));
  data.bookings = [];
  const html = renderToStaticMarkup(createElement(QueryClientProvider,{ client: new QueryClient() },createElement(ServiceRequestCard,{ data, request: { ...serializeSchedule(scheduled), id: "off-page-conflict", reference: "CONFLICT", serviceId: scheduled.serviceId, basePrice: scheduled.basePrice, city: "Test city", postalCode: "380015", description: "Safe preview", availability: "available" } })));
  assert.ok(html.includes("Conflicts with another appointment"));
  assert.match(html,/<button[^>]*disabled=""[^>]*>Accept request<\/button>/);
  assert.equal(requestAvailability({ ...scheduled, scheduleMode: "asap", arrivalAt: null },data.reservations!),"available");
});

test("pagination controls expose labelled navigation, record ranges, and disabled boundaries",() => {
  const html = renderToStaticMarkup(createElement(PaginationControls,{ info: pageInfo(215,22), label: "bookings", onPage: () => {}, onSize: () => {} }));
  assert.ok(html.includes('aria-label="bookings pagination"'));
  assert.ok(html.includes("Showing 211–215 of 215 bookings"));
  assert.ok(html.includes("Page 22 of 22"));
  assert.ok(html.includes('aria-label="bookings per page"'));
  assert.match(html,/<button[^>]*disabled=""[^>]*aria-label="Next page of bookings"/);
});
