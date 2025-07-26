import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { v4 as uuidv4 } from "uuid";
import {
  SPACES_ACCESS_KEY,
  SPACES_ACCESS_KEY_ID,
  SPACES_ENDPOINT,
  SPACES_REGION,
  SPACES_BUCKET,
  MAX_FILE_SIZE,
  MAX_FILE_COUNT,
} from "@/config";
import { NextFunction, Request, Response } from "express";
import { ErrorResponse, getError } from "@/utils";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpStatusCode } from "axios";

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

    key: function (req: any, file, cb) {
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

export const getPreSignedUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req?.user?.id;
    const { fileName, fileType, sessionId } = req.body;

    if (!fileName || !fileType || !userId || !sessionId) {
      throw new ErrorResponse(
        "fileName, fileType, sessionId, and userId are required.",
        HttpStatusCode.BadRequest
      );
    }

    const modifiedSessionId = `${userId}-${sessionId}`;

    // Generate a unique filename to prevent collisions and duplicates in the S3 bucket
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `/posts/${uuidv4()}${fileExtension}`;
    const tempS3Key = `${userId}/temp-uploads/${modifiedSessionId}/${uniqueFileName}`;

    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: tempS3Key,
      ContentType: fileType,
      // You can add metadata here to be stored with the object in S3
      Metadata: {
        "x-amz-meta-original-name": fileName,
        "x-amz-meta-user-id": userId,
        "x-amz-meta-session-id": modifiedSessionId,
      },
    });

    // Generate the presigned URL with a limited expiration time (e.g., 60 minutes)
    const expiresIn = 60 * 60; // 60 minutes
    const presignedUrl = await getSignedUrl(s3Config, command, { expiresIn });

    res.status(200).json({
      url: presignedUrl,
      key: tempS3Key,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the URL." });
  }
};

/**
 * Helper function to recursively delete all objects in a given S3 prefix.
 * This is useful for cleaning up the temporary folder.
 */
export async function deleteFolderByPrefix(prefix: string) {
  try {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: SPACES_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse: ListObjectsV2CommandOutput = await s3Config.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const objectsToDelete = listResponse.Contents.map((obj) => ({
          Key: obj.Key,
        }));

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: SPACES_BUCKET,
          Delete: {
            Objects: objectsToDelete as { Key: string }[],
            Quiet: true, // Don't return success results
          },
        });

        await s3Config.send(deleteCommand);
        console.log(
          `Deleted ${objectsToDelete.length} objects from prefix ${prefix}`
        );
      }

      isTruncated = listResponse.IsTruncated || false;
      continuationToken = listResponse.NextContinuationToken;
    }
  } catch (error) {
    console.error(`Failed to clear prefix ${prefix}:`, error);
  }
}
