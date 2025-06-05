import otpGenerator from "otp-generator";
import bycrpt from "bcryptjs";
import BaseService from "./base.service";
import { ErrorResponse } from "@/utils";
import { HttpStatusCode } from "axios";
import { NodeLabels } from "@/enums";

class OtpService extends BaseService {
  async generateOTP(email: string) {
    const OTP = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const salt = await bycrpt.genSalt(10);
    const hashedOTP = await bycrpt.hash(OTP, salt);

    await this.writeToDB(
      `
      MERGE (o:${NodeLabels.OTP} {email: $email})
      SET o.createdAt = datetime(), o.expiresAt=datetime() + duration({ minutes: 5 }), o.otp = $otp 
    `,
      {
        otp: hashedOTP,
        email,
      }
    );

    return OTP;
  }

  findOTP = async (email: string) => {
    const result = await this.readFromDB(
      `
      MATCH (o:${NodeLabels.OTP} {email: $email})
      WHERE o.expiresAt > datetime()
      RETURN o
        `,
      { email }
    );

    if (!result?.records?.length) {
      throw new ErrorResponse(
        "Invalid or Expired One Time Password",
        HttpStatusCode.BadRequest
      );
    }

    const otp = result.records.map((v) => v.get("o").properties)[0];
    return otp
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
