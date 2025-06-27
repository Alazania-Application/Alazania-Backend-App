import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  SPACES_ACCESS_KEY,
  SPACES_ACCESS_KEY_ID,
  SPACES_ENDPOINT,
  SPACES_REGION,
  SPACES_BUCKET,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
} from "@/config";
import { Request } from "express";
import { getError } from "@/utils";

export const s3Config: S3Client = new S3Client({
  endpoint: SPACES_ENDPOINT,
  region: SPACES_REGION,
  credentials: {
    accessKeyId: SPACES_ACCESS_KEY_ID,
    secretAccessKey: SPACES_ACCESS_KEY,
  },
});

export const multerMiddleware = multer({
  storage: multerS3({
    s3: s3Config,
    bucket: SPACES_BUCKET,
    acl: "public-read",

    key: function (req: Request, file, cb) {
      cb(
        null,
        `${req?.user?.id || "user"}/${Date.now()}_${path.basename(
          file.originalname
        )}`
      );
    },
  }),
  fileFilter(_, file, callback) {
    if (file.mimetype.startsWith("image/")) callback(null, true);
    else {
      callback(new Error("Only images are allowwed") as any, false);
    }
  },

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT,
  },
});

export const multerConfig = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

export const uploadFile = async (
  file: Buffer,
  fileName: string
): Promise<string | undefined> => {
  try {
    const params = {
      Bucket: SPACES_BUCKET,
      Key: fileName,
      Body: file,
      ACL: "public-read",
    } satisfies PutObjectCommandInput;

    let attempts = 0;
    while (attempts < 3) {
      try {
        const { Location } = await new Upload({
          client: s3Config,
          params,
        }).done();
        return Location;
      } catch (error) {
        attempts++;
        if (attempts >= 3) throw error;
        await new Promise((res) => setTimeout(res, 500 + attempts));
      }
    }
  } catch (error) {
    console.error(`Failed to upload file: ${getError(error)}`);
    throw new Error(`Failed to upload file: ${fileName}`);
  }
};
