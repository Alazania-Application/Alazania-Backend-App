import { emailService } from "@/services";
import { IUser } from "@/types/user";
import type Mail from "nodemailer/lib/mailer";

class EmailRepository {


  sendResetPasswordMail = async ({
    user,
    resetUrl,
  }: {
    user: Partial<IUser>;
    resetUrl: string;
  }) => {
    const message = `You are receiving this email because you (or someone else) has requested a password reset.`;

    let mailOptions = {
      from: `Alazania <ifechi.dev@gmail.com>`,
      to: `${user.email}`,
      subject: "Reset Password",
      text: `Hey ${user.firstName},\n\n${message}\n\n Open this link in your browser: ${resetUrl}\n\nBest regards,\n\nThe Nkata Team.
      `,
      //   html: generateResetMessage(user?.firstName || "", message, resetUrl),
    };

    await emailService.sendMail(mailOptions);
  };
}

export const emailRepository = new EmailRepository();
