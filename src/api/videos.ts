import { respondWithJSON } from "./json";
import { randomBytes } from "crypto";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo, type Video } from "../db/videos";
import { mediaTypeToExt } from "./assets";
import path from "path";
import { uploadVideoToS3 } from "../s3";
import { rm } from "fs/promises";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const UPLOAD_LIMIT = 1 << 30;

  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Video not found");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("No video file.");
  }
  if (file.size > UPLOAD_LIMIT) {
    throw new BadRequestError("Video size exceeds max allowed size of 1GB");
  }

  const videoType = file.type;
  if (!videoType) {
    throw new BadRequestError("Missing Content-Type for video");
  }
  if (videoType !== "video/mp4") {
    throw new BadRequestError("Invalid file type");
  }

  const ext = mediaTypeToExt(videoType);
  const tempFilePath = path.join("/tmp", `${videoId}${ext}`);
  await Bun.write(tempFilePath, file);

  const aspectRatio = await getVideoAspectRatio(tempFilePath);

  const randomFilename = randomBytes(32).toString("base64url");
  const fileKey = `${randomFilename}${ext}`;
  const key = path.join(aspectRatio, fileKey);

  const processedFilePath = await processVideoForFastStart(tempFilePath);
  await uploadVideoToS3(cfg, key, processedFilePath, videoType);

  video.videoURL = `${cfg.s3CfDistribution}${key}`;
  updateVideo(cfg.db, video);

  await Promise.all([
    rm(tempFilePath, { force: true }),
    rm(`${tempFilePath}.processed.mp4`, { force: true }),
  ]);

  return respondWithJSON(200, video);
}

async function getVideoAspectRatio(filePath: string) {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(stderrText);
  }

  const stdOut = JSON.parse(stdoutText);
  if (!stdOut.streams || stdOut.streams.length === 0) {
    throw new Error("No video data");
  }
  if (!stdOut.streams[0].width || !stdOut.streams[0].height) {
    throw new Error("No video dimensions found");
  }

  const { width, height } = stdOut.streams[0];
  const aspectRatio = Math.floor(height / width);

  const LANDSCAPE_RATIO = Math.floor(9 / 16);
  const PORTRAIT_RATIO = Math.floor(16 / 9);
  if (aspectRatio === LANDSCAPE_RATIO) {
    return "landscape";
  } else if (aspectRatio === PORTRAIT_RATIO) {
    return "portrait";
  } else {
    return "other";
  }
}

async function processVideoForFastStart(inputFilePath: string) {
  const outputFilePath = `${inputFilePath}.processed.mp4`;
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-i",
      inputFilePath,
      "-movflags",
      "faststart",
      "-map_metadata",
      "0",
      "-codec",
      "copy",
      "-f",
      "mp4",
      outputFilePath,
    ],
    { stderr: "pipe" },
  );
  const stderrText = await new Response(proc.stderr).text();

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(stderrText);
  }

  return outputFilePath;
}

