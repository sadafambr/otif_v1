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
  // --- sessionStorage daily cache ---
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const cacheKey = `order_summary_${order.salesOrder}_${today}_v4`;

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached) as OrderSummaryResponse;
    }
  } catch {
    // sessionStorage unavailable or parse error — continue to API
  }

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
      top1Feature: order.top1Feature,
      top1Value: order.top1Value,
      top1Shap: order.top1Shap,
      top2Feature: order.top2Feature,
      top2Value: order.top2Value,
      top2Shap: order.top2Shap,
      top3Feature: order.top3Feature,
      top3Value: order.top3Value,
      top3Shap: order.top3Shap,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to fetch order summary");
  }

  const result: OrderSummaryResponse = await res.json();

  // Store in sessionStorage for same-session reuse
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
  } catch {
    // quota exceeded or unavailable — ignore
  }

  return result;
}

export interface EnrichedRow {
  rowIndex: number;
  probHit: number;
  probMiss: number;
  riskScore: number;
  prediction: "Hit" | "Miss";
  top1Feature?: string | null;
  top1Value?: string | null;
  top1Shap?: number | null;
  top2Feature?: string | null;
  top2Value?: string | null;
  top2Shap?: number | null;
  top3Feature?: string | null;
  top3Value?: string | null;
  top3Shap?: number | null;
}

export interface EnrichResponse {
  month: string;
  threshold: number;
  totalOrders: number;
  rows: EnrichedRow[];
}

/**
 * Upload a raw CSV/Excel file to the backend for model inference + SHAP.
 * Returns per-row enriched data (probabilities, predictions, top SHAP features).
 */
export async function enrichOrders(file: File, token?: string): Promise<EnrichResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/orders/enrich`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to enrich orders");
  }

  return res.json();
}

export interface FavoriteFilter {
  id: number;
  user_id: number;
  name: string;
  filter_state: string;
}

export async function fetchFavorites(token: string): Promise<FavoriteFilter[]> {
  const res = await fetch(`${API_BASE}/user/favorites`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch favorites");
  return res.json();
}

export async function saveFavorite(token: string, name: string, filterState: string): Promise<FavoriteFilter> {
  const res = await fetch(`${API_BASE}/user/favorites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, filter_state: filterState }),
  });
  if (!res.ok) throw new Error("Failed to save favorite");
  return res.json();
}

export async function deleteFavorite(token: string, favId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/user/favorites/${favId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Failed to delete favorite");
}
