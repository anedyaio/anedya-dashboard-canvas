/**
 * Formats errors from Supabase authentication and database operations.
 * Detects network failures / paused Supabase projects and returns a clear, user-friendly message.
 */
export function formatSupabaseError(error: any): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  // Extract raw error string or message
  const rawMessage = typeof error === 'string'
    ? error
    : error.message || error.error_description || error.details || error.msg || (typeof error === 'object' ? JSON.stringify(error) : String(error));

  const lowerMsg = rawMessage.toLowerCase();
  const status = error?.status || error?.statusCode || error?.status_code;

  // Detect paused project / unreachable Supabase backend signatures
  const isPausedOrOffline =
    lowerMsg.includes("failed to fetch") ||
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("networkerror") ||
    lowerMsg.includes("network error") ||
    lowerMsg.includes("network request failed") ||
    lowerMsg.includes("project is paused") ||
    lowerMsg.includes("project paused") ||
    lowerMsg.includes("project_paused") ||
    lowerMsg.includes("service unavailable") ||
    status === 503 ||
    status === 502 ||
    status === 504;

  if (isPausedOrOffline) {
    return "Your Supabase project has been paused due to inactivity. Please ask your admin to resume it.";
  }

  // Common authentication error mappings for better UX
  if (lowerMsg.includes("invalid login credentials")) {
    return "Invalid email or password. Please check your credentials and try again.";
  }
  if (lowerMsg.includes("email not confirmed")) {
    return "Your email address has not been confirmed yet. Please check your inbox for the confirmation link.";
  }

  return rawMessage;
}
