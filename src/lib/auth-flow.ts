export const providerOnboardingPath = "/become-a-provider";

// Intent chooses an onboarding destination, never an account role or approval.
export function getAuthFlow(intent: string | string[] | undefined) {
  const provider = intent === "provider";
  return {
    provider,
    destination: provider ? providerOnboardingPath : "/customer",
    signInUrl: provider ? "/sign-in?intent=provider" : "/sign-in",
    signUpUrl: provider ? "/sign-up?intent=provider" : "/sign-up",
  };
}
