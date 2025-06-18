import dns from "dns";
import colors from "colors";
import * as path from "path";
import fs from "fs";
import { NextFunction, Request, Response } from "express";
import Mailjet, { LibraryResponse, SendEmailV3_1 } from "node-mailjet";
import { ErrorResponse } from "@/utils";
import { HttpStatusCode } from "axios";
// import { IUser } from "@/dtos/user";
import {
  MAIL_PASSWORD,
  MAIL_USERNAME,
  MJ_APIKEY_PRIVATE,
  MJ_APIKEY_PUBLIC,
} from "@/config";
import { type Transporter, createTransport } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

class EmailService {
  private mailjet: Mailjet;
  private transporter: Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  >;

  constructor() {
    this.mailjet = new Mailjet.Client({
      apiKey: MJ_APIKEY_PUBLIC,
      apiSecret: MJ_APIKEY_PRIVATE,
    });

    this.transporter = createTransport({
      service: "Gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // use SSL
      auth: {
        user: MAIL_USERNAME,
        pass: MAIL_PASSWORD,
      },
    });
  }

  private getHtmlTemplateWithData(
    templates: string /*templateFilePath: string*/,
    data: any
  ) {
    const baseTemplateFilePath = path.join(
      __dirname,
      "/../emailTemplate/base-template.html"
    );
    const baseTemplate = fs.readFileSync(baseTemplateFilePath, {
      encoding: "utf8",
    });
    // let bodyTemplate = templateFilePath.map(v =>
    //   fs.readFileSync(v, { encoding: "utf8" }),
    // );

    let templateWithBody = baseTemplate.replace("{body}", templates);

    Object.keys(data).forEach((key) => {
      const keyString = "{" + key + "}";
      templateWithBody = templateWithBody.replace(
        new RegExp(keyString, "g"),
        data[key]
      );
    });

    return templateWithBody;
  }

  send = async (Messages: SendEmailV3_1.Body) =>
    await this.mailjet.post("send", { version: "v3.1" }).request({
      Messages,
    });

  sendMail = async (mailOptions: Mail.Options) => {
    console.log(colors.yellow(`Sending mail to ${mailOptions?.to}`));

    return await this.transporter.sendMail(mailOptions).then((res) => {
      console.log(colors.green(`Mail sent successfully`));
      return res;
    });
  };

  isValidEmailFormat = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  isOrgEmail = (email: string) => {
    const freeDomains = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "icloud.com",
      "aol.com",
      "zoho.com",
      "protonmail.com",
      "yandex.com",
      "yopmail.com",
    ];
    if (!this.isValidEmailFormat(email)) {
      throw new Error("Invalid email format");
    }
    const domain = email.split("@")[1].toLowerCase();
    return !freeDomains.includes(domain);
  };

  hasMXRecords = async (email: string): Promise<boolean> => {
    if (!this.isValidEmailFormat(email)) {
      throw new ErrorResponse(
        "Invalid email format",
        HttpStatusCode.BadRequest
      );
    }
    const domain = email.split("@")[1];

    return new Promise((resolve) => {
      dns.resolveMx(domain, (err, addresses) => {
        if (err || !addresses || addresses.length === 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  isValidEmail = async (req: Request, res: Response, next: NextFunction) => {
    const email = req.body.email;
    const hasMXRecords = await this.hasMXRecords(email);

    if (!hasMXRecords) {
      throw new ErrorResponse(
        "Invalid email format",
        HttpStatusCode.BadRequest
      );
    }
    next();
  };
  test = async () => {
    const request = await this.mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: 'kolade@fusionintel.io',
            Name: 'Me',
          },
          To: [
            {
              Email: 'ifechimine@gmail.com',
              Name: 'You',
            },
          ],
          Subject: 'My first Mailjet Email!',
          TextPart: 'Greetings from Mailjet!',
          HTMLPart:
            '<h3>Dear passenger 1, welcome to <a href="https://www.mailjet.com/">Mailjet</a>!</h3><br />May the delivery force be with you!',
        },
      ],
    });
    const data: SendEmailV3_1.Body = {
      Messages: [
        {
          From: {
            Email: 'kolade@fusionintel.io',
            Name: 'Me',
          },
          To: [
            {
              Email: 'ifechimine@gmail.com',
              Name: 'You',
            },
          ],
          Subject: 'Your email flight plan!',
          HTMLPart: '<h3>Dear passenger, welcome to Mailjet!</h3><br />May the delivery force be with you!',
          TextPart: 'Dear passenger, welcome to Mailjet! May the delivery force be with you!',
        },
      ],
    };

    const response: LibraryResponse<SendEmailV3_1.Response> = await this.mailjet
          .post('send', { version: 'v3.1' })
          .request(data);

  const { Status } = response.body.Messages[0];

    console.log({Status, res: JSON.stringify(request.body)});
  };
}

export const emailService = new EmailService();
