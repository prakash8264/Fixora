import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthFlow, providerOnboardingPath } from "../src/lib/auth-flow";

test("provider intent is preserved between sign-in and sign-up",() => {
  assert.deepEqual(getAuthFlow("provider"),{
    provider: true,
    destination: providerOnboardingPath,
    signInUrl: "/sign-in?intent=provider",
    signUpUrl: "/sign-up?intent=provider",
  });
});

test("unknown, repeated, or external intents never select a privileged destination",() => {
  for (const intent of [undefined,"customer","admin","https://example.invalid",["provider","admin"]]) {
    assert.deepEqual(getAuthFlow(intent),{
      provider: false,
      destination: "/customer",
      signInUrl: "/sign-in",
      signUpUrl: "/sign-up",
    });
  }
});
