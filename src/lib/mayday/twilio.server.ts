// Twilio REST helpers. Two auth modes:
//   - API Key (recommended): TWILIO_ACCOUNT_SID + TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET
//     (basic auth user = SK..., password = secret; URLs still use the AC... account sid)
//   - Auth Token: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
// TWILIO_API_BASE is overridable for tests.

export type TwilioCreds = { accountSid: string; user: string; pass: string; base: string };

export function twilioCreds(): TwilioCreds | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const base = (process.env.TWILIO_API_BASE || "https://api.twilio.com").replace(/\/$/, "");
  if (!accountSid) return null;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  if (keySid && keySecret) return { accountSid, user: keySid, pass: keySecret, base };
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) return { accountSid, user: accountSid, pass: authToken, base };
  return null;
}

export function twilioBasicAuth(creds: TwilioCreds): string {
  const raw = `${creds.user}:${creds.pass}`;
  const b64 = typeof btoa !== "undefined" ? btoa(raw) : Buffer.from(raw).toString("base64");
  return `Basic ${b64}`;
}

let numbersCache: { from?: string; to?: string; at: number } | null = null;

// Discover the account's own number (From) and first verified caller ID (To)
// so the console prefills itself — no typing on stage.
export async function discoverNumbers(): Promise<{ from?: string; to?: string }> {
  const creds = twilioCreds();
  if (!creds) return {};
  if (numbersCache && Date.now() - numbersCache.at < 5 * 60_000) return numbersCache;
  const headers = { Authorization: twilioBasicAuth(creds) };
  const acct = `${creds.base}/2010-04-01/Accounts/${creds.accountSid}`;
  const out: { from?: string; to?: string; at: number } = { at: Date.now() };
  try {
    const [numsRes, idsRes] = await Promise.all([
      fetch(`${acct}/IncomingPhoneNumbers.json?PageSize=1`, {
        headers,
        signal: AbortSignal.timeout(4000),
      }),
      fetch(`${acct}/OutgoingCallerIds.json?PageSize=1`, {
        headers,
        signal: AbortSignal.timeout(4000),
      }),
    ]);
    if (numsRes.ok) {
      const j = (await numsRes.json()) as { incoming_phone_numbers?: { phone_number: string }[] };
      const n = j.incoming_phone_numbers?.[0]?.phone_number;
      if (n) out.from = n;
    }
    if (idsRes.ok) {
      const j = (await idsRes.json()) as { outgoing_caller_ids?: { phone_number: string }[] };
      // Keep the EXACT stored format — trial accounts may only call the
      // verified string verbatim (e.g. "+330688903650", odd zero included).
      const n = j.outgoing_caller_ids?.[0]?.phone_number;
      if (n) out.to = n;
    }
  } catch {
    /* discovery is best-effort */
  }
  numbersCache = out;
  return out;
}
