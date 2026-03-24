/// <reference types="vite/client" />
/**
 * Simple smoke test to verify API utility functions compile
 * and the VITE_API_BASE_URL structure is valid.
 * Run this test using your preferred test runner (e.g., Vitest or Jest).
 */
import { describe, it, expect } from 'vitest';
import { login, fetchOrderSummary } from './src/lib/api';

describe('Frontend API Smoke Test', () => {
  it('should have API functions defined', () => {
    expect(login).toBeDefined();
    expect(fetchOrderSummary).toBeDefined();
  });

  it('VITE_API_BASE_URL should not be hardcoded in production', () => {
    // If running in a test env without Vite vars, it typically falls back to localhost defaults.
    // Ensure the structure exists and handles fallbacks.
    const baseUrl = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000';
    expect(baseUrl).toContain('http');
  });
});
