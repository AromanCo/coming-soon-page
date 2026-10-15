import { NextResponse } from "next/server";
import {
  createSubscription,
  hashNetworkIdentifier,
  isWaitlistConfigured,
  registerRateLimitAttempt,
} from "@/lib/waitlist";
import { normalizeIranianMobile } from "@/lib/iranian-mobile";
import { getClientNetworkIdentity } from "@/lib/client-ip";

export const runtime = "nodejs";

const MAX_REQUEST_BODY_BYTES = 4 * 1024;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type WaitlistPayload = {
  phone?: unknown;
  consent?: unknown;
  website?: unknown;
};

class RequestBodyTooLargeError extends Error {}

function jsonResponse(
  body: Record<string, string>,
  status: number,
  headers: HeadersInit = {},
) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);

  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

async function readJsonBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > MAX_REQUEST_BODY_BYTES
  ) {
    throw new RequestBodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      if (bytesRead > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }

      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  body += decoder.decode();
  return JSON.parse(body) as unknown;
}

export async function POST(request: Request) {
  if (!isWaitlistConfigured()) {
    return jsonResponse(
      {
        code: "WAITLIST_UNAVAILABLE",
        message: "سامانه ثبت شماره موبایل فعلاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.",
      },
      503,
    );
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return jsonResponse(
      { code: "UNSUPPORTED_MEDIA_TYPE", message: "نوع اطلاعات ارسال‌شده معتبر نیست." },
      415,
    );
  }

  let payload: WaitlistPayload;

  try {
    const parsed = await readJsonBody(request);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new SyntaxError("Expected a JSON object");
    }

    payload = parsed as WaitlistPayload;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonResponse(
        { code: "REQUEST_TOO_LARGE", message: "حجم اطلاعات ارسال‌شده بیش از حد مجاز است." },
        413,
      );
    }

    return jsonResponse(
      { code: "INVALID_REQUEST", message: "اطلاعات ارسال‌شده معتبر نیست." },
      400,
    );
  }

  if (typeof payload.website === "string" && payload.website.length > 0) {
    return jsonResponse(
      { code: "INVALID_REQUEST", message: "اطلاعات ارسال‌شده معتبر نیست." },
      400,
    );
  }

  if (typeof payload.phone !== "string") {
    return jsonResponse(
      { code: "INVALID_PHONE", message: "لطفاً یک شماره موبایل معتبر وارد کنید." },
      400,
    );
  }

  const phoneE164 = normalizeIranianMobile(payload.phone);

  if (!phoneE164) {
    return jsonResponse(
      { code: "INVALID_PHONE", message: "لطفاً یک شماره موبایل معتبر وارد کنید." },
      400,
    );
  }

  if (payload.consent !== true) {
    return jsonResponse(
      {
        code: "CONSENT_REQUIRED",
        message:
          "برای عضویت، موافقت با دریافت دعوت‌نامه و خبرهای شروع آرومان از طریق پیامک لازم است.",
      },
      400,
    );
  }

  const clientIdentity = getClientNetworkIdentity(request);

  if (!clientIdentity) {
    return jsonResponse(
      { code: "INVALID_REQUEST", message: "اطلاعات ارسال‌شده معتبر نیست." },
      400,
    );
  }

  try {
    const ipHash = hashNetworkIdentifier(clientIdentity);
    const allowed = await registerRateLimitAttempt(ipHash);

    if (!allowed) {
      return jsonResponse(
        {
          code: "RATE_LIMITED",
          message: "تعداد تلاش‌ها زیاد بود. لطفاً ده دقیقه دیگر دوباره امتحان کنید.",
        },
        429,
        { "Retry-After": "600" },
      );
    }

    const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
    await createSubscription({ phoneE164, ipHash, userAgent });

    return jsonResponse(
      {
        code: "REQUEST_ACCEPTED",
        message: "ممنون! شماره‌ات برای لیست دعوت آرومان دریافت شد.",
      },
      202,
    );
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    console.error("Waitlist subscription failed", { code: errorCode });
    return jsonResponse(
      {
        code: "WAITLIST_UNAVAILABLE",
        message: "ثبت شماره موبایل انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.",
      },
      503,
    );
  }
}
