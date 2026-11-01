import "server-only";
import { Resend } from "resend";

type Email = { to: string; subject: string; text: string; html: string };

// Sends through Resend when RESEND_API_KEY is set; otherwise prints the
// message to the server log so links can be followed during development.
export async function sendEmail({ to, subject, text, html }: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`\n[email not sent - no RESEND_API_KEY]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { sent: false };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM as string,
    to,
    subject,
    text,
    html,
  });
  if (error) throw new Error(`Email to ${to} failed: ${error.message}`);
  return { sent: true };
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Button = { label: string; url: string; secondary?: boolean };

function layout(heading: string, body: string, buttons: Button[], list: string[] = []) {
  const links = buttons
    .map(
      (b) =>
        `<a href="${b.url}" style="background:${b.secondary ? "#ffffff" : "#4f46e5"};color:${b.secondary ? "#171717" : "#ffffff"};border:1px solid ${b.secondary ? "#d4d4d4" : "#4f46e5"};text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;display:inline-block;margin:0 8px 8px 0">${escapeHtml(b.label)}</a>`
    )
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#171717">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escapeHtml(body)}</p>
${list.length ? `<ul style="font-size:15px;line-height:1.5;margin:0 0 20px;padding-left:20px">${list.map((line) => `<li style="margin:0 0 8px">${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
<p style="margin:0 0 12px">${links}</p>
${buttons.length ? `<p style="font-size:12px;color:#737373;margin:0">Or paste this link into your browser:<br>${buttons[0].url}</p>` : ""}
</div>`;
}

export function inviteEmail(firstName: string, orgName: string, url: string) {
  const body = `Hi ${firstName}, you've been invited to ${orgName} on Simple Services. Set a password to see your schedule and respond to requests. This link works for 7 days.`;
  return {
    subject: `You're invited to ${orgName} on Simple Services`,
    text: `${body}\n\n${url}`,
    html: layout(`Welcome to ${orgName}`, body, [{ label: "Set your password", url }]),
  };
}

export function testEmail(orgName: string) {
  const body = `This is a test from ${orgName} on Simple Services. If you're reading it, email is working.`;
  return { subject: "Simple Services test email", text: body, html: layout("Email is working", body, []) };
}

export function resetEmail(firstName: string, url: string) {
  const body = `Hi ${firstName}, use the link below to choose a new Simple Services password. This link works for 1 hour. If you didn't ask for this, you can ignore this email.`;
  return {
    subject: "Reset your Simple Services password",
    text: `${body}\n\n${url}`,
    html: layout("Reset your password", body, [{ label: "Choose a new password", url }]),
  };
}

export type ScheduleEmailKind = "request" | "reminder" | "service";

// One email per person per service, covering every position they hold on it. Someone
// asked about several at once gets `scheduleListEmail` instead.
//   request   first ask
//   reminder  they haven't answered yet
//   service   they said yes and the service is a few days away
export function scheduleEmail(
  kind: ScheduleEmailKind,
  details: { firstName: string; orgName: string; service: string; positions: string[]; times?: string[]; confirmUrl: string; declineUrl: string }
) {
  const roles = details.positions.join(", ");
  // Rehearsal, arrival and the like, when the plan has any.
  const times = details.times?.length ? ` Other times: ${details.times.join("; ")}.` : "";

  if (kind === "service") {
    const body = `Hi ${details.firstName}, a reminder that you're serving at ${details.service} (${roles}).${times} If something has come up, use the link below to let us know.`;
    return {
      subject: `Reminder: you're serving at ${details.service}`,
      text: `${body}\n\nCan't make it: ${details.declineUrl}`,
      html: layout("See you soon", body, [{ label: "I can't make it", url: details.declineUrl, secondary: true }]),
    };
  }

  const opening = kind === "reminder" ? "we're still waiting to hear whether you can serve" : `${details.orgName} would like you to serve`;
  const body = `Hi ${details.firstName}, ${opening} at ${details.service} (${roles}).${times} Please let us know either way.`;
  return {
    subject: `${kind === "reminder" ? "Reminder: can" : "Can"} you serve at ${details.service}?`,
    text: `${body}\n\nYes, I can: ${details.confirmUrl}\nNo, I can't: ${details.declineUrl}`,
    html: layout(kind === "reminder" ? "Can you make it?" : "Can you serve?", body, [
      { label: "Yes, I can", url: details.confirmUrl },
      { label: "No, I can't", url: details.declineUrl, secondary: true },
    ]),
  };
}

// Several services in one email. There's one button, to a page listing them, where
// each gets its own answer.
export function scheduleListEmail(
  kind: Exclude<ScheduleEmailKind, "service">,
  details: { firstName: string; orgName: string; services: { service: string; positions: string[]; times: string[] }[]; url: string }
) {
  const count = details.services.length;
  const lines = details.services.map(({ service, positions, times }) => `${service} (${positions.join(", ")})${times.length ? `. Other times: ${times.join("; ")}` : ""}`);
  const opening = kind === "reminder" ? `we're still waiting to hear whether you can serve at these ${count} services` : `${details.orgName} would like you to serve at these ${count} services`;
  const body = `Hi ${details.firstName}, ${opening}. Please let us know for each one.`;
  return {
    subject: `${kind === "reminder" ? "Reminder: can" : "Can"} you serve at these ${count} services?`,
    text: `${body}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n\nAnswer here: ${details.url}`,
    html: layout(kind === "reminder" ? "Can you make it?" : "Can you serve?", body, [{ label: "See your services and answer", url: details.url }], lines),
  };
}
