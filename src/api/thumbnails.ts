import { randomBytes } from 'crypto';
import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import { type BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getAssetDiskPath, getAssetURL, mediaTypeToExt } from "./assets";

const MAX_UPLOAD_SIZE = 10 << 20;

const thumbnailMimeTypes = ["image/png", "image/png"];

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const videoMD = getVideo(cfg.db, videoId);
  if(!videoMD) {
    throw new NotFoundError("Video not found");
  }
  if (videoMD.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update video");
  }

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const thumbnail = formData.get("thumbnail");
  if (!(thumbnail instanceof File)) {
    throw new BadRequestError("Invalid file type upload");
  }

  if (thumbnail.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail size exceeds max allowed size of 10MB");
  }

  const mediaType = thumbnail.type; 
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for thumbnail");
  }

  if (!thumbnailMimeTypes.includes(mediaType)) {
    throw new BadRequestError("Invalid file type");
  }

  const ext = mediaTypeToExt(mediaType);
  const randomFilename = randomBytes(32).toString("base64url");
  const fileName = `${randomFilename}${ext}`;

  const assetDiskpath = getAssetDiskPath(cfg, fileName);
  Bun.write(assetDiskpath, thumbnail);

  const urlPath = getAssetURL(cfg, fileName);
  videoMD.thumbnailURL = urlPath;
  updateVideo(cfg.db, videoMD);

  return respondWithJSON(200, videoMD);
}
