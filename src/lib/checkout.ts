"use client";

type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type CheckoutInstance = { open: () => void; on: (event: string, callback: () => void) => void };
declare global { interface Window { Razorpay?: new (options: Record<string,unknown>) => CheckoutInstance } }
let loading: Promise<void> | undefined;

export async function requestJson<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url,{ cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "The request could not be completed.");
  return json;
}

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve,reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error("Couldn’t load the payment window. Please try again.")); };
    document.head.appendChild(script);
  });
  return loading;
}

export async function startCheckout(bookingId: string) {
  await loadCheckout();
  const order = await requestJson<{ keyId: string; orderId: string; amount: number; currency: string }>("/api/payments/orders",{ bookingId });
  if (!window.Razorpay) throw new Error("Payment checkout is unavailable.");
  return new Promise<{ captured: boolean; pending?: boolean }>((resolve,reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: "Fixora", description: "Home service · Test Mode", theme: { color: "#216d5d" },
      handler: async (result: CheckoutResult) => {
        try { resolve(await requestJson("/api/payments/verify",{ bookingId,...result })); }
        catch (error) { reject(error); }
      },
      modal: { ondismiss: () => reject(new Error("Payment window closed. If you completed payment, use Check payment status.")) },
    });
    checkout.on("payment.failed",() => reject(new Error("Payment was not completed. You can retry the same order.")));
    checkout.open();
  });
}
