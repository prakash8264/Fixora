import assert from "node:assert/strict";
import { test } from "node:test";

test("the public root renders the landing page without a sign-in redirect", async () => {
  const response = await fetch(`${process.env.FIXORA_TEST_BASE_URL ?? "http://localhost:3000"}/`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status,200);
  assert.equal(response.headers.get("location"),null);
  const html = await response.text();
  assert.ok(html.includes("Less to-do."));
  for (const section of ["services","how-it-works","faq"]) assert.ok(html.includes(`id="${section}"`));
  assert.ok(html.includes('href="/customer"'));
  assert.ok(html.includes("Skip to content"));
  assert.ok(html.includes('href="/become-a-provider"') || html.includes('href="/provider"'));
  for (const policy of ["There is no upfront payment", "pay only the visit fee", "If the provider never arrives", "Know the visit fee"]) assert.ok(html.includes(policy));
  assert.ok(html.includes("As soon as possible"));
  assert.ok(html.includes("30-minute"));
});

test("provider entry preserves onboarding intent without exposing the application anonymously",async () => {
  const base = process.env.FIXORA_TEST_BASE_URL ?? "http://localhost:3000";
  const response = await fetch(`${base}/become-a-provider`,{ redirect: "manual", signal: AbortSignal.timeout(30000) });
  assert.equal(response.status,307);
  const location = new URL(response.headers.get("location")!,base);
  if (location.pathname === "/provider") return; // Explicit demo mode.
  assert.equal(location.pathname,"/sign-up");
  assert.equal(location.searchParams.get("intent"),"provider");
  for (const path of ["sign-up","sign-in"]) {
    const page = await fetch(`${base}/${path}?intent=provider`,{ redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(page.status,200);
    const html = await page.text();
    assert.ok(html.includes("provider"));
    assert.ok(html.includes("/become-a-provider"));
  }
});
