/** Short, consistent copy for auth flows (Login / Register). */

function isNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed")
  );
}

export function humanizeLoginError(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : "";
  switch (raw) {
    case "USER_NOT_FOUND":
    case "User not found":
      return "User not found. Please register again.";
    case "WRONG_PASSWORD":
    case "Incorrect password":
      return "Incorrect Password. Please try again.";
    default:
      break;
  }
  const lower = raw.toLowerCase();
  if (lower.includes("user not found")) {
    return "User not found. Please register again.";
  }
  if (lower.includes("incorrect password") || lower.includes("wrong_password")) {
    return "Incorrect Password. Please try again.";
  }
  if (lower.includes("incorrect email or password")) {
    return "Incorrect email or password. Please try again.";
  }
  if (isNetworkError(raw)) {
    return "Unable to reach the server. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

export function humanizeRegisterError(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : "";
  const lower = raw.toLowerCase();

  if (lower.includes("already registered") || lower.includes("email already")) {
    return "Email already registered. Please sign in.";
  }
  if (lower.includes("invalid role")) {
    return "Invalid role selected. Please try again.";
  }
  if (
    lower.includes("not a valid email") ||
    (lower.includes("value error") && lower.includes("email")) ||
    (lower.includes("email") && (lower.includes("invalid") || lower.includes("format")))
  ) {
    return "Please enter valid email address and try again.";
  }
  if (isNetworkError(raw)) {
    return "Unable to reach the server. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
