import type { OTIFRecord } from "@/types/otif";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface AuthUser {
  id: number;
  email: string;
  role: "admin" | "user";
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const body = new URLSearchParams();
  body.append("username", email);
  body.append("password", password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Login failed");
  }

  const data = await res.json();
  return {
    token: data.access_token,
    user: data.user,
  };
}

export async function register(email: string, password: string, role: "admin" | "user"): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, role }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Registration failed");
  }
}

export interface OrderSummaryResponse {
  probHit: number;
  probMiss: number;
  prediction: "Hit" | "Miss";
  explanation: string;
  riskDrivers: {
    rank: number;
    name: string;
    value: string;
    description: string;
    shapValue: number;
    maxShap: number;
    explanation: string;
    flag: boolean;
  }[];
  genaiSummary?: string;
  shapOneLiner?: string;
}

export async function fetchOrderSummary(order: OTIFRecord, token?: string): Promise<OrderSummaryResponse> {
  const res = await fetch(`${API_BASE}/orders/summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      salesOrder: order.salesOrder,
      customer: order.customer,
      material: order.material,
      plant: order.plant,
      reqDelivery: order.reqDelivery,
      leadTime: order.leadTime,
      riskScore: order.riskScore,
      probHit: order.probHit,
      probMiss: order.probMiss,
      status: order.status,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to fetch order summary");
  }

  return res.json();
}

