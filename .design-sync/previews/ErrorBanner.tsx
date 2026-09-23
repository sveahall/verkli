import { ErrorBanner } from "@verkli/web";

// errorCode keys come from the ERROR_MESSAGES map in ErrorBanner.tsx.
// Passing errorCode directly is the documented prop path; without it the
// component reads ?error= from the URL.
export function AuthorRequired() {
  return <ErrorBanner errorCode="author_required" />;
}

export function SessionExpired() {
  return <ErrorBanner errorCode="session_expired" />;
}

export function Unauthorized() {
  return <ErrorBanner errorCode="unauthorized" />;
}

export function NotFound() {
  return <ErrorBanner errorCode="not_found" />;
}

export function ServerError() {
  return <ErrorBanner errorCode="server_error" />;
}
