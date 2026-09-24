import { z } from "zod";

export const eventTypes = [
  "Corporate Event",
  "Party",
  "Wedding",
  "Private Booking",
  "Other",
] as const;
export const enquirySchema = z
  .object({
    requestId: z.guid(),
    name: z.string().trim().min(2, "Enter your name.").max(120),
    email: z.email("Enter a valid email address.").max(254),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine(
        (value) => !value || /^[+\d\s()\-]{7,40}$/.test(value),
        "Enter a valid phone number.",
      ),
    eventType: z.enum(eventTypes),
    eventDate: z
      .union([z.literal(""), z.iso.date()])
      .refine(
        (value) =>
          !value ||
          value >=
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "Europe/London",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
        "Choose today or a future date.",
      ),
    guests: z.union([
      z.literal(""),
      z
        .string()
        .regex(/^\d{1,5}$/)
        .transform(Number)
        .pipe(z.number().int().min(1).max(10000)),
    ]),
    location: z.string().trim().min(2, "Enter a venue or area.").max(300),
    message: z
      .string()
      .trim()
      .min(10, "Tell us a little more about your event.")
      .max(5000),
    website: z.string().max(200).default(""),
  })
  .strict();

export type Enquiry = z.infer<typeof enquirySchema>;
export type EnquiryEmailBrand = {
  siteUrl: string;
  logoUrl: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function enquiryEmail(enquiry: Enquiry, brand: EnquiryEmailBrand) {
  const date = enquiry.eventDate
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "long",
        timeZone: "Europe/London",
      }).format(new Date(`${enquiry.eventDate}T12:00:00Z`))
    : "To be confirmed";
  const customer = [
    ["Name", enquiry.name],
    ["Email", enquiry.email],
    ["Phone", enquiry.phone || "Not provided"],
  ];
  const event = [
    ["Event type", enquiry.eventType],
    ["Date", date],
    ["Guests", String(enquiry.guests || "To be confirmed")],
    ["Venue / area", enquiry.location],
  ];
  const rows = (values: string[][]) =>
    values
      .map(
        ([label, value]) =>
          `<tr><th align="left" valign="top" style="padding:11px 18px 11px 0;width:34%;font-size:11px;line-height:1.45;text-transform:uppercase;color:#73756f;">${label}</th><td valign="top" style="padding:11px 0;font-size:15px;line-height:1.45;color:#181918;overflow-wrap:anywhere;">${escapeHtml(value)}</td></tr>`,
      )
      .join("");
  const socialLinks = [
    [brand.instagramUrl, "Instagram"],
    [brand.facebookUrl, "Facebook"],
  ].filter((entry): entry is [string, string] => Boolean(entry[0]));
  const socialHtml = socialLinks
    .map(
      ([url, label]) =>
        `<td style="padding:0 8px;"><a href="${escapeHtml(url)}" style="display:inline-block;color:#f0bb7d;text-decoration:none;"><img src="https://cdn.simpleicons.org/${label.toLowerCase()}/f0bb7d" width="20" height="20" alt="${label}" style="display:inline-block;width:20px;height:20px;border:0;vertical-align:middle;"><span style="padding-left:7px;font-size:12px;vertical-align:middle;">${label}</span></a></td>`,
    )
    .join("");
  const socialText = socialLinks.length
    ? `\n\nFOLLOW PAPA'S\n${socialLinks.map(([url, label]) => `${label}: ${url}`).join("\n")}`
    : "";
  const copyrightYear = new Date().getFullYear();
  const email = {
    subject: `New ${enquiry.eventType.toLowerCase()} enquiry | Papa's Tacos`,
    text: `PAPA'S TACOS\nNEW EVENT ENQUIRY\n\nCUSTOMER\n${customer.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nEVENT\n${event.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nMESSAGE\n${enquiry.message}\n\nReply to this email to contact ${enquiry.name}. This is an enquiry, not a confirmed booking.\n\nWebsite: ${brand.siteUrl}${socialText}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event enquiry | Papa's Tacos</title><style>@media(max-width:600px){.email-shell{padding:0!important}.email-main{padding:28px 20px!important}.email-header{padding:24px 20px!important}.email-footer{padding:26px 20px!important}.email-logo{width:260px!important}}</style></head><body style="margin:0;background:#eeefeb;color:#181918;font-family:Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">New ${escapeHtml(enquiry.eventType.toLowerCase())} enquiry from ${escapeHtml(enquiry.name)}.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eeefeb;"><tr><td class="email-shell" align="center" style="padding:32px 12px;"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border-collapse:collapse;"><tr><td class="email-header" align="center" style="padding:28px 40px;background:#181918;border-bottom:4px solid #f0bb7d;"><a href="${escapeHtml(brand.siteUrl)}" style="display:inline-block;text-decoration:none;"><img class="email-logo" src="${escapeHtml(brand.logoUrl)}" width="340" alt="Papa's Tacos" style="display:block;width:340px;max-width:100%;height:auto;border:0;"></a></td></tr><tr><td class="email-main" style="padding:42px 48px 46px;"><p style="margin:0 0 10px;font-size:11px;line-height:1.4;font-weight:bold;text-transform:uppercase;color:#087b55;">Event enquiry</p><h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:700;color:#181918;">A new booking enquiry has arrived.</h1><p style="margin:14px 0 34px;font-size:15px;line-height:1.65;color:#5e615b;">Here are the details supplied by ${escapeHtml(enquiry.name)}. Reply directly to this email to continue the conversation.</p><h2 style="margin:0;padding-bottom:9px;border-bottom:2px solid #f0bb7d;font-size:15px;line-height:1.4;color:#181918;">Customer</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 28px;border-collapse:collapse;">${rows(customer)}</table><h2 style="margin:0;padding-bottom:9px;border-bottom:2px solid #f0bb7d;font-size:15px;line-height:1.4;color:#181918;">Event</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 28px;border-collapse:collapse;">${rows(event)}</table><h2 style="margin:0 0 12px;padding-bottom:9px;border-bottom:2px solid #f0bb7d;font-size:15px;line-height:1.4;color:#181918;">Message</h2><div style="padding:18px 20px;background:#f4f5f2;border-left:3px solid #087b55;font-size:15px;line-height:1.7;color:#292a27;overflow-wrap:anywhere;">${escapeHtml(enquiry.message).replace(/\r?\n/g, "<br>")}</div><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:30px;"><tr><td style="background:#f0bb7d;"><a href="mailto:${encodeURIComponent(enquiry.email)}" style="display:inline-block;padding:13px 20px;color:#181918;font-size:14px;font-weight:bold;text-decoration:none;">Reply to ${escapeHtml(enquiry.name)}</a></td></tr></table><p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#73756f;">This is an enquiry, not a confirmed booking.</p></td></tr><tr><td class="email-footer" align="center" style="padding:30px 32px;background:#181918;color:#fffaf2;"><p style="margin:0;font-size:13px;line-height:1.6;color:#b7b9b0;">Mexican soul. Street food spirit. Made fresh.</p>${socialHtml ? `<table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:18px auto 0;"><tr>${socialHtml}</tr></table>` : ""}<p style="margin:20px 0 0;font-size:11px;line-height:1.5;color:#85877f;">&copy; ${copyrightYear} Papa's Tacos</p></td></tr></table></td></tr></table></body></html>`,
  };
  email.subject = `New ${enquiry.eventType} Enquiry | Papa's Tacos`;
  email.text = email.text.replace("NEW EVENT ENQUIRY", "EVENTS BOOKING\nNEW BOOKING ENQUIRY");
  email.html = email.html
    .replace("<title>Event enquiry | Papa's Tacos</title>", "<title>Events Booking | Papa's Tacos</title>")
    .replace(`New ${escapeHtml(enquiry.eventType.toLowerCase())} enquiry from`, `New ${escapeHtml(enquiry.eventType)} Enquiry from`)
    .replace(">Event enquiry</p>", ">EVENTS BOOKING</p>")
    .replace(">A new booking enquiry has arrived.</h1>", ">New Booking Enquiry</h1>")
    .replace(">Customer</h2>", ">Customer Details</h2>")
    .replace(">Customer details</h2>", ">Customer Details</h2>")
    .replace(">Event</h2>", ">Event Details</h2>")
    .replace(">Event details</h2>", ">Event Details</h2>")
    .replace(">Message</h2>", ">Their Message</h2>")
    .replace(">Their message</h2>", ">Their Message</h2>");
  return email;
}
