import { isIP } from "node:net";

const CANONICAL_CLIENT_IP_HEADER = "x-aroman-client-ip";

function validIpAddress(value: string | null) {
  if (!value) return null;

  const candidate = value.trim();
  return candidate.length > 0 && !candidate.includes(",") && isIP(candidate) !== 0
    ? candidate
    : null;
}

export function getClientNetworkIdentity(request: Request) {
  const mode = process.env.CLIENT_IP_MODE;

  if (mode === "caddy") {
    return validIpAddress(request.headers.get(CANONICAL_CLIENT_IP_HEADER));
  }

  if (
    mode === "development" &&
    process.env.ALLOW_INSECURE_CLIENT_IP_HEADERS === "true"
  ) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0] ?? null;
    return (
      validIpAddress(forwarded) ??
      validIpAddress(request.headers.get("x-real-ip"))
    );
  }

  return null;
}
