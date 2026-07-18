import { Resend } from "resend";

let resend: Resend | undefined;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("RESEND_API_KEY is not set. Email sending will be mocked or disabled.");
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const safeResetLink = escapeHtml(resetLink);
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Gemslanka LK password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9; color: #333333;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f9f9f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto;">
          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: left;">
              <h2 style="margin: 0 0 20px 0; font-size: 24px; color: #1a1a1a;">Gemslanka LK</h2>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5; color: #4a4a4a;">Hello,</p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #4a4a4a;">We received a request to reset the password for your Gemslanka LK account.</p>
              <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.5; color: #4a4a4a;">Click the button below to create a new password.</p>
              
              <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${safeResetLink}" target="_blank" style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 28px; border: 1px solid #0066cc; display: inline-block;">Reset Password</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #666666;">For your security, this password-reset link will expire after a limited period and can only be used once.</p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #666666;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #4a4a4a;">Thank you,<br>Gemslanka LK Support Team</p>
            </td>
          </tr>
        </table>
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto;">
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999999;">&copy; ${new Date().getFullYear()} Gemslanka LK. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `
Hello,

We received a request to reset the password for your Gemslanka LK account.

Click the link below to create a new password:
${resetLink}

For your security, this password-reset link will expire after a limited period and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Thank you,
Gemslanka LK Support Team
  `.trim();

  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: "Gemslanka LK <noreply@gemslanka.lk>",
        to: email,
        replyTo: "support@gemslanka.lk",
        subject: "Reset your Gemslanka LK password",
        html: htmlContent,
        text: textContent,
      });
      if (error) {
        console.error("Resend API error:", error);
        throw new Error("Failed to send password reset email via Resend");
      }
    } catch (err) {
      console.error("Failed to send email:", err);
      throw err;
    }
  } else {
    // For local dev if no key is provided
    console.info("Mock email sent. Reset Link:", resetLink);
  }
}
