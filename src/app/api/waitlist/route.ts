import { NextResponse } from "next/server";
import {
  createSubscription,
  hashNetworkIdentifier,
  isWaitlistConfigured,
  registerRateLimitAttempt,
} from "@/lib/waitlist";
import { normalizeIranianMobile } from "@/lib/iranian-mobile";

export const runtime = "nodejs";

type WaitlistPayload = {
  phone?: unknown;
  consent?: unknown;
  website?: unknown;
};

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  if (!isWaitlistConfigured()) {
    return NextResponse.json(
      {
        code: "WAITLIST_UNAVAILABLE",
        message: "سامانه ثبت شماره موبایل فعلاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.",
      },
      { status: 503 },
    );
  }

  let payload: WaitlistPayload;

  try {
    payload = (await request.json()) as WaitlistPayload;
  } catch {
    return NextResponse.json(
      { code: "INVALID_REQUEST", message: "اطلاعات ارسال‌شده معتبر نیست." },
      { status: 400 },
    );
  }

  if (typeof payload.website === "string" && payload.website.length > 0) {
    return NextResponse.json(
      { code: "INVALID_REQUEST", message: "اطلاعات ارسال‌شده معتبر نیست." },
      { status: 400 },
    );
  }

  if (typeof payload.phone !== "string") {
    return NextResponse.json(
      { code: "INVALID_PHONE", message: "لطفاً یک شماره موبایل معتبر وارد کنید." },
      { status: 400 },
    );
  }

  const phoneE164 = normalizeIranianMobile(payload.phone);

  if (!phoneE164) {
    return NextResponse.json(
      { code: "INVALID_PHONE", message: "لطفاً یک شماره موبایل معتبر وارد کنید." },
      { status: 400 },
    );
  }

  if (payload.consent !== true) {
    return NextResponse.json(
      {
        code: "CONSENT_REQUIRED",
        message:
          "برای عضویت، موافقت با دریافت دعوت‌نامه و خبرهای شروع آرومان از طریق پیامک لازم است.",
      },
      { status: 400 },
    );
  }

  try {
    const ipHash = hashNetworkIdentifier(clientAddress(request));
    const allowed = await registerRateLimitAttempt(ipHash);

    if (!allowed) {
      return NextResponse.json(
        {
          code: "RATE_LIMITED",
          message: "تعداد تلاش‌ها زیاد بود. لطفاً ده دقیقه دیگر دوباره امتحان کنید.",
        },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
    const created = await createSubscription({ phoneE164, ipHash, userAgent });

    if (!created) {
      return NextResponse.json(
        {
          code: "DUPLICATE_PHONE",
          message: "این شماره قبلاً در لیست دعوت آرومان ثبت شده است.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        code: "SUBSCRIBED",
        message: "شماره موبایلت با موفقیت در لیست دعوت آرومان ثبت شد.",
      },
      { status: 201 },
    );
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    console.error("Waitlist subscription failed", { code: errorCode });
    return NextResponse.json(
      {
        code: "WAITLIST_UNAVAILABLE",
        message: "ثبت شماره موبایل انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.",
      },
      { status: 503 },
    );
  }
}
