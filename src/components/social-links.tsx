type SocialNetwork = "instagram" | "telegram" | "linkedin";

type SocialLinkConfig = {
  network: SocialNetwork;
  label: string;
  url: string | undefined;
  allowedHosts: readonly string[];
};

const allowedHostsByNetwork: Record<SocialNetwork, readonly string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  telegram: ["t.me", "telegram.me", "www.telegram.me"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
};

const socialLinkConfigs: readonly SocialLinkConfig[] = [
  {
    network: "instagram",
    label: "اینستاگرام",
    url: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    allowedHosts: allowedHostsByNetwork.instagram,
  },
  {
    network: "telegram",
    label: "تلگرام",
    url: process.env.NEXT_PUBLIC_TELEGRAM_URL,
    allowedHosts: allowedHostsByNetwork.telegram,
  },
  {
    network: "linkedin",
    label: "لینکدین",
    url: process.env.NEXT_PUBLIC_LINKEDIN_URL,
    allowedHosts: allowedHostsByNetwork.linkedin,
  },
];

function approvedUrl(
  value: string | undefined,
  allowedHosts: readonly string[],
) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && allowedHosts.includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function SocialIcon({ network }: { network: SocialNetwork }) {
  if (network === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle className="social-icon-dot" cx="17.4" cy="6.7" r="1" />
      </svg>
    );
  }

  if (network === "telegram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.7 4.2 17.8 19c-.2 1-1 1.3-1.8.8l-4.4-3.2-2.1 2c-.2.2-.4.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.5-.2L6.5 13.3l-4.4-1.4c-1-.3-1-1 .2-1.5L19.5 3.8c.8-.3 1.5.2 1.2.4Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.2 8.5V19M6.2 5.2v.1M10.5 19v-5.8c0-2.6 4-3.1 4 0V19M10.5 9.8V19M18.5 19v-6.6c0-5-5.4-4.8-8-2.3" />
    </svg>
  );
}

export function SocialLink({
  network,
  label,
  href,
}: {
  network: SocialNetwork;
  label: string;
  href: string;
}) {
  const approvedHref = approvedUrl(href, allowedHostsByNetwork[network]);
  if (!approvedHref) return null;

  return (
    <a
      className="social-link"
      href={approvedHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} رسمی آرومان (در پنجره جدید)`}
    >
      <SocialIcon network={network} />
      <span>{label}</span>
    </a>
  );
}

export function SocialLinks() {
  const links = socialLinkConfigs.flatMap((item) => {
    const href = approvedUrl(item.url, item.allowedHosts);
    return href ? [{ ...item, href }] : [];
  });

  if (links.length === 0) return null;

  return (
    <nav className="social-links" aria-label="شبکه‌های اجتماعی رسمی آرومان">
      {links.map((link) => (
        <SocialLink
          key={link.network}
          network={link.network}
          label={link.label}
          href={link.href}
        />
      ))}
    </nav>
  );
}
