const DEFAULT_RECIPIENT = "evelasenterprise@gmail.com";
const MAX_BODY_BYTES = 40_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

const rateLimitStore = globalThis.__eveLasInquiryRateLimits || new Map();
globalThis.__eveLasInquiryRateLimits = rateLimitStore;

function text(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return text(Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0] || req.socket?.remoteAddress || "unknown", 100);
}

function isRateLimited(ip) {
  const now = Date.now();
  const existing = rateLimitStore.get(ip) || [];
  const recent = existing.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitStore.set(ip, recent);

  if (rateLimitStore.size > 1_000) {
    for (const [key, timestamps] of rateLimitStore.entries()) {
      if (!timestamps.some((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS)) {
        rateLimitStore.delete(key);
      }
    }
  }

  return recent.length > RATE_LIMIT_MAX;
}

async function sendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = new Error("Email service is not configured.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result?.message || "Email provider rejected the request.");
    error.code = "EMAIL_PROVIDER_ERROR";
    error.status = response.status;
    throw error;
  }

  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "Inquiry is too large." });
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many inquiries. Please try again later." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // Honeypot: bots commonly fill fields hidden from human visitors.
  if (text(body.website, 200)) {
    return res.status(200).json({ ok: true });
  }

  const inquiry = {
    inquiryType: text(body.inquiryType, 80),
    name: text(body.name, 120),
    company: text(body.company, 160),
    email: text(body.email, 254).toLowerCase(),
    phone: text(body.phone, 80),
    commodity: text(body.commodity, 300),
    origin: text(body.origin, 160),
    mode: text(body.mode, 80),
    summary: text(body.summary, 4_000),
    consent: Boolean(body.consent),
  };

  if (!inquiry.name || !isEmail(inquiry.email) || !inquiry.commodity || !inquiry.summary || !inquiry.consent) {
    return res.status(400).json({
      ok: false,
      error: "Please complete the required fields and provide a valid email address.",
    });
  }

  const recipient = process.env.INQUIRY_TO_EMAIL || DEFAULT_RECIPIENT;
  const sender = process.env.INQUIRY_FROM_EMAIL || "Eve Las Website <onboarding@resend.dev>";
  const submittedAt = new Date().toISOString();
  const subjectCommodity = inquiry.commodity.replace(/[\r\n]+/g, " ").slice(0, 90);
  const subject = `[Website inquiry] ${inquiry.inquiryType || "General"} — ${subjectCommodity}`;

  const rows = [
    ["Inquiry type", inquiry.inquiryType || "Not specified"],
    ["Name", inquiry.name],
    ["Company", inquiry.company || "Not provided"],
    ["Email", inquiry.email],
    ["Phone", inquiry.phone || "Not provided"],
    ["Commodity / species", inquiry.commodity],
    ["Country of origin", inquiry.origin || "Not provided"],
    ["Transport mode", inquiry.mode || "Not decided"],
    ["Submitted", submittedAt],
  ];

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #e5ebe7;color:#607068;font-size:13px;width:180px">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e5ebe7;color:#13241e;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const plainText = [
    "NEW EVE LAS WEBSITE INQUIRY",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Requirement summary:",
    inquiry.summary,
    "",
    `Source IP: ${ip}`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#13241e"><div style="max-width:720px;margin:0 auto;padding:28px 14px"><div style="background:#123b2b;color:#fff;padding:24px 28px;border-radius:16px 16px 0 0"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#bad8c6">Eve Las Enterprise</div><h1 style="font-size:24px;margin:8px 0 0">New website inquiry</h1></div><div style="background:#fff;padding:24px 28px;border-radius:0 0 16px 16px"><table style="width:100%;border-collapse:collapse">${htmlRows}</table><h2 style="font-size:16px;margin:26px 0 8px">Requirement summary</h2><div style="white-space:pre-wrap;background:#f6f8f7;border:1px solid #e5ebe7;border-radius:10px;padding:16px;line-height:1.6">${escapeHtml(inquiry.summary)}</div><p style="font-size:12px;color:#6b7b73;margin:24px 0 0">Reply directly to this email to respond to ${escapeHtml(inquiry.name)} at ${escapeHtml(inquiry.email)}.</p></div></div></body></html>`;

  try {
    const result = await sendEmail({
      from: sender,
      to: [recipient],
      reply_to: inquiry.email,
      subject,
      text: plainText,
      html,
    });

    return res.status(200).json({ ok: true, id: result.id || null });
  } catch (error) {
    console.error("Inquiry email failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });

    if (error.code === "EMAIL_NOT_CONFIGURED") {
      return res.status(503).json({ ok: false, error: "Automatic email is not configured yet." });
    }

    return res.status(502).json({ ok: false, error: "The inquiry could not be emailed. Please try again." });
  }
};
