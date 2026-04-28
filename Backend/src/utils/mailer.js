import nodemailer from "nodemailer";
import env from "../config/env.js";
import logger from "../config/logger.js";

let transporterPromise = null;

const buildTransporter = async () => {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    logger.info(`Mail transport: ${env.SMTP_HOST}:${env.SMTP_PORT || 587}`);
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: (env.SMTP_PORT || 587) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  const test = await nodemailer.createTestAccount();
  logger.warn(
    `Mail transport: Ethereal test account (${test.user}) — preview URLs will be logged per message`,
  );
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: test.user, pass: test.pass },
  });
};

const getTransporter = () => {
  if (!transporterPromise) transporterPromise = buildTransporter();
  return transporterPromise;
};

export const sendMail = async ({ to, subject, html, text }) => {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: env.SMTP_FROM || "MERN Task Manager <no-reply@example.com>",
      to,
      subject,
      html,
      text: text || stripHtml(html),
    });
    const preview = nodemailer.getTestMessageUrl?.(info);
    if (preview) logger.info(`Mail preview: ${preview}`);
    return info;
  } catch (err) {
    logger.error(`Mail send failed: ${err.message}`);
    throw err;
  }
};

const stripHtml = (html = "") => html.replace(/<[^>]+>/g, "").trim();

// ---- Templates (minimal — swap for mjml/react-email later) ----

const wrap = (title, body, cta) => `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
    <div style="font-size:15px;line-height:1.55;color:#333">${body}</div>
    ${cta ? `<p style="margin:24px 0"><a href="${cta.href}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${cta.label}</a></p>` : ""}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p style="font-size:12px;color:#888">MERN Task Manager — automated message, please do not reply.</p>
  </div>`;

export const resetPasswordTemplate = (name, url) => ({
  subject: "Reset your password",
  html: wrap(
    `Hi ${name || "there"},`,
    `<p>We received a request to reset your password. Click below to set a new one. Expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
    { href: url, label: "Reset password" },
  ),
});

export const assignmentTemplate = (name, taskTitle, url) => ({
  subject: `New task assigned: ${taskTitle}`,
  html: wrap(
    `Hi ${name || "there"},`,
    `<p>You have been assigned a new task: <strong>${taskTitle}</strong>.</p>`,
    { href: url, label: "Open task" },
  ),
});

export const mentionTemplate = (name, taskTitle, author, url) => ({
  subject: `${author} mentioned you on "${taskTitle}"`,
  html: wrap(
    `Hi ${name || "there"},`,
    `<p><strong>${author}</strong> mentioned you in a comment on <strong>${taskTitle}</strong>.</p>`,
    { href: url, label: "View comment" },
  ),
});
