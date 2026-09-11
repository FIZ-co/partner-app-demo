/** The caller keeps each action's key stable until its outcome is known. */
export async function apiRequest(
  config,
  token,
  path,
  { method = "GET", payload, requestId } = {},
  fetchImpl = fetch,
) {
  if (method !== "GET" && !requestId)
    throw new Error("An Idempotency-Key is required by this example.");
  const response = await fetchImpl(new URL(path, config.api), {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload && { "Content-Type": "application/json" }),
      ...(requestId && { "Idempotency-Key": requestId }),
    },
    ...(payload && { body: JSON.stringify(payload) }),
  });
  if (!response.ok) {
    const hints = {
      401: "Check expiry, app availability and the token resource. Reconnect if the grant was revoked.",
      403: "Check the granted scopes, company membership and API entitlement.",
      422: "This key was used with another payload. Keep the original payload for a retry.",
      429: "Wait for Retry-After before trying again.",
    };
    const retry = response.headers?.get("Retry-After");
    const requiresReconciliation = response.status === 409 && !retry;
    const hint =
      response.status === 409
        ? retry
          ? "The request is still running. Wait, then retry this same order with its existing key."
          : "The earlier request may have taken effect. Stop retries and check FIZ. This key cannot start another execution; only use a new key after confirming the original operation is finished and had no effect. Contact support if uncertain."
        : (hints[response.status] ??
          "Check the request against the API reference.");
    throw Object.assign(
      new Error(
        `${method} ${path} returned HTTP ${response.status}. ${hint}${retry ? ` Retry-After: ${retry}.` : ""}`,
      ),
      { requiresReconciliation },
    );
  }
  return response.json();
}

export const createDraft = (config, token, payload, requestId, fetchImpl) =>
  apiRequest(
    config,
    token,
    "/invoices",
    { method: "POST", payload, requestId },
    fetchImpl,
  );
