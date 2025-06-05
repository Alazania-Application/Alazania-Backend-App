import { emailService } from "@/services";
import { IUser } from "@/models";

class EmailRepository {
  sendVerificationEmail = async ({
    user,
    OTP,
  }: {
    user: Partial<IUser>;
    OTP: string;
  }) => {
    const message = `You are receiving this email because you (or someone else) has requested a password reset.`;

    let mailOptions = {
      from: `Alazania <ifechi.dev@gmail.com>`,
      to: `${user.email}`,
      subject: "Verify Your Account",
      text: `Hey ${
        user?.firstName || ""
      },\n\n${message}\n\n Use this OTP to verify your account: ${OTP}\n\nOTP expires in 5 minutes\n\nBest regards,\n\nThe Alazania Team.
      `,
      //   html: generateResetMessage(user?.firstName || "", message, resetUrl),
    };

    await emailService.sendMail(mailOptions);
  };
  sendResetPasswordMail = async ({
    user,
    OTP,
  }: {
    user: Partial<IUser>;
    OTP: string;
  }) => {
    const message = `You are receiving this email because you (or someone else) has requested a password reset.`;

    let mailOptions = {
      from: `Alazania <ifechi.dev@gmail.com>`,
      to: `${user.email}`,
      subject: "Reset Password OTP",
      text: `Hey ${
        user?.firstName || ""
      },\n\n${message}\n\n Use this OTP to recover your account: ${OTP}\n\nOTP expires in 5 minutes\n\nBest regards,\n\nThe Alazania Team.
      `,
      //   html: generateResetMessage(user?.firstName || "", message, resetUrl),
    };

    await emailService.sendMail(mailOptions);
  };
}

export const emailRepository = new EmailRepository();
