import { localDate } from "../domain";
import type { DemoState } from "../types";

export const demoCustomerId = "customer-aarav";
export const demoProviderId = "provider-rohan";
export const demoAdminId = "admin-fixora";

export function createDemoState(): DemoState {
  const now = new Date().toISOString();
  const home = { id: "address-home", label: "Home", line: "24, Maple Residency, Satellite", city: "Ahmedabad", postalCode: "380015" };
  const state: DemoState = {
    version: 1,
    profile: { name: "Aarav Sharma", email: "aarav@example.com", phone: "9876543210" },
    addresses: [home, { id: "address-office", label: "Office", line: "402, Westgate Business Bay", city: "Ahmedabad", postalCode: "380015" }],
    services: [
      { id: "cleaning", name: "Home cleaning", category: "Cleaning", description: "A fresh start, in every corner. Thorough cleaning for your everyday spaces.", price: 149900, icon: "sparkles", color: "mint", active: true },
      { id: "plumbing", name: "Plumbing", category: "Repairs", description: "Leaky taps, blocked drains, and everything in between. We’ll get it flowing.", price: 49900, icon: "droplet", color: "blue", active: true },
      { id: "electrical", name: "Electrical", category: "Repairs", description: "Safe, reliable help with switches, fixtures, wiring, and small repairs.", price: 39900, icon: "zap", color: "amber", active: true },
      { id: "ac", name: "AC service", category: "Appliances", description: "Keep your cool with a complete AC check-up, cleaning, and service.", price: 79900, icon: "snowflake", color: "lavender", active: true },
      { id: "painting", name: "Painting", category: "Improvements", description: "Give your space a new beginning. Includes an initial assessment visit.", price: 99900, icon: "paintbrush", color: "rose", active: true },
      { id: "carpentry", name: "Carpentry", category: "Repairs", description: "Thoughtful fixes for furniture, doors, fittings, and wooden essentials.", price: 59900, icon: "hammer", color: "sand", active: true },
    ],
    providers: [
      { id: demoProviderId, name: "Rohan Patel", initials: "RP", bio: "Your neighbourhood repair expert. 6 years of hands-on experience.", services: ["plumbing", "electrical", "ac"], areas: ["380015", "380054"], rating: 4.9, jobs: 128, status: "approved", suspended: false, clockedIn: true },
      { id: "provider-meera", name: "Meera Shah", initials: "MS", bio: "Making homes feel fresh, one visit at a time.", services: ["cleaning", "painting"], areas: ["380015"], rating: 4.8, jobs: 96, status: "approved", suspended: false, clockedIn: true },
      { id: "provider-dev", name: "Dev Desai", initials: "DD", bio: "Practical solutions for your home’s everyday repairs.", services: ["plumbing", "electrical", "carpentry", "ac"], areas: ["380015"], rating: 4.7, jobs: 74, status: "approved", suspended: false, clockedIn: true },
      { id: "provider-nisha", name: "Nisha Joshi", initials: "NJ", bio: "Professional home cleaning with attention to the little details.", services: ["cleaning"], areas: ["380015"], rating: 0, jobs: 0, status: "pending", suspended: false, clockedIn: false },
    ],
    bookings: [
      { id: "booking-1048", reference: "FX-1048", customerId: demoCustomerId, customerName: "Aarav Sharma", serviceId: "plumbing", providerId: demoProviderId, date: localDate(1), slot: "morning", description: "The kitchen tap has been dripping. Please check the washer and water pressure.", address: home, basePrice: 49900, total: 49900, status: "accepted", payment: "unpaid", createdAt: now },
      { id: "booking-1047", reference: "FX-1047", customerId: demoCustomerId, customerName: "Aarav Sharma", serviceId: "cleaning", providerId: "provider-meera", date: localDate(3), slot: "midday", description: "Deep clean the living room, kitchen, and two bedrooms.", address: home, basePrice: 149900, total: 149900, status: "accepted", payment: "unpaid", createdAt: now },
      { id: "booking-1046", reference: "FX-1046", customerId: demoCustomerId, customerName: "Aarav Sharma", serviceId: "ac", providerId: demoProviderId, date: localDate(-3), slot: "afternoon", description: "Routine service for the bedroom split AC.", address: home, basePrice: 79900, total: 79900, status: "completed", payment: "captured", createdAt: now },
      { id: "booking-1045", reference: "FX-1045", customerId: demoCustomerId, customerName: "Aarav Sharma", serviceId: "electrical", providerId: "provider-dev", date: localDate(-7), slot: "morning", description: "Replace the faulty switch in the dining room.", address: home, basePrice: 39900, total: 39900, status: "completed", payment: "captured", createdAt: now },
      { id: "booking-1049", reference: "FX-1049", customerId: demoCustomerId, customerName: "Aarav Sharma", serviceId: "electrical", providerId: null, date: localDate(2), slot: "midday", description: "The ceiling fan is making a clicking noise. Please inspect the fitting.", address: home, basePrice: 39900, total: 39900, status: "requested", payment: "unpaid", createdAt: now },
    ],
    invitations: [{ id: "invite-1", bookingId: "booking-1049", providerId: demoProviderId, status: "pending" }, { id: "invite-2", bookingId: "booking-1049", providerId: "provider-dev", status: "pending" }],
    estimates: [],
    events: [
      { id: "event-1", bookingId: "booking-1048", title: "Service requested", actor: "Aarav Sharma", createdAt: now },
      { id: "event-2", bookingId: "booking-1048", title: "Rohan accepted your booking", actor: "Rohan Patel", createdAt: now },
      { id: "event-3", bookingId: "booking-1046", title: "Service completed", actor: "Rohan Patel", createdAt: now },
    ],
    notifications: [
      { id: "notification-1", recipientId: demoCustomerId, title: "Your home is in good hands", description: "Rohan Patel accepted your plumbing booking.", bookingId: "booking-1048", read: false, createdAt: now },
      { id: "notification-2", recipientId: demoCustomerId, title: "A fresher home is on the way", description: "Meera Shah confirmed your home cleaning visit.", bookingId: "booking-1047", read: false, createdAt: now },
      { id: "notification-3", recipientId: demoProviderId, title: "A new request near you", description: "Electrical service · Satellite · available midday slot.", bookingId: "booking-1049", read: false, createdAt: now },
    ],
    payments: [{ id: "DEMO-PAY-1046", bookingId: "booking-1046", amount: 79900, createdAt: now }, { id: "DEMO-PAY-1045", bookingId: "booking-1045", amount: 39900, createdAt: now }],
    reviews: [{ id: "review-1", bookingId: "booking-1045", providerId: "provider-dev", rating: 5, comment: "On time, friendly, and explained the repair clearly.", createdAt: now }],
  };
  // A booking owns a snapshot; it must not share the editable address object.
  return { ...state, bookings: state.bookings.map(booking => ({ ...booking, address: { ...booking.address } })) };
}
