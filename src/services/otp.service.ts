import otpGenerator from "otp-generator";
import bycrpt from "bcryptjs";
import BaseService from "./base.service";
import { ErrorResponse } from "@/utils";
import { HttpStatusCode } from "axios";
import { NodeLabels } from "@/enums";

class OtpService extends BaseService {
  async generateOTP() {
    const OTP = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const salt = await bycrpt.genSalt(10);
    const hashedOTP = await bycrpt.hash(OTP, salt);

    return { OTP, hashedOTP };
  }

  findOTP = async (email: string, type: "verification" | "reset-password") => {
    const result = await this.readFromDB(
      `
      MATCH (o:${NodeLabels.OTP} {email: $email, type: $type})
      WHERE o.expiresAt > datetime()
      RETURN o
        `,
      { email, type }
    );

    if (!result?.records?.length) {
      throw new ErrorResponse(
        "Invalid or Expired One Time Password",
        HttpStatusCode.BadRequest
      );
    }

    const otp = result.records.map((v) => v.get("o").properties)[0];
    return otp;
  };

  async deleteExpiredOTPS() {
    await super.writeToDB(
      `
        MATCH (o:${NodeLabels.OTP})
        WHERE o.expiresAt < datetime()
        DETACH DELETE o
      `
    );
  }
}

export const otpService = new OtpService();
