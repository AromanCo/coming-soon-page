import { NextResponse } from "next/server";
import {
  createSubscription,
  hashNetworkIdentifier,
  isValidEmail,
  isWaitlistConfigured,
  normalizeEmail,
  registerRateLimitAttempt,
} from "@/lib/waitlist";

export const runtime = "nodejs";

type WaitlistPayload = {
  email?: unknown;
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
        message: "سامانه ثبت ایمیل فعلاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.",
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

  if (typeof payload.email !== "string") {
    return NextResponse.json(
      { code: "INVALID_EMAIL", message: "لطفاً یک ایمیل معتبر وارد کنید." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(payload.email);

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { code: "INVALID_EMAIL", message: "لطفاً یک ایمیل معتبر وارد کنید." },
      { status: 400 },
    );
  }

  if (payload.consent !== true) {
    return NextResponse.json(
      {
        code: "CONSENT_REQUIRED",
        message:
          "برای عضویت، موافقت با دریافت دعوت‌نامه و خبرهای مرتبط لازم است.",
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
    const created = await createSubscription({ email, ipHash, userAgent });

    if (!created) {
      return NextResponse.json(
        {
          code: "DUPLICATE_EMAIL",
          message: "این ایمیل قبلاً در لیست دعوت آرومان ثبت شده است.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        code: "SUBSCRIBED",
        message:
          "به لیست دعوت آرومان خوش آمدی! ثبت‌نامت انجام شد. خبرهای مربوط به دعوت‌نامه را با ایمیل برایت می‌فرستیم.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Waitlist subscription failed", error);
    return NextResponse.json(
      {
        code: "WAITLIST_UNAVAILABLE",
        message: "ثبت ایمیل انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.",
      },
      { status: 503 },
    );
  }
}
