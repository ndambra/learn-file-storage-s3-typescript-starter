import path  from 'path';
import type { ApiConfig } from "./config";
import { updateVideo, type Video } from "./db/videos";

export async function uploadVideoToS3(
  cfg: ApiConfig,
  key: string,
  processesFilePath: string,
  contentType: string,
) {
  const s3file = cfg.s3Client.file(key, { bucket: cfg.s3Bucket });
  const fileContents = Bun.file(processesFilePath);
  await s3file.write(fileContents, {
    type: contentType,
  });
}