import { v2 as cloudinary } from "cloudinary";
import env, { cloudinaryEnabled } from "./env.js";
import logger from "./logger.js";

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info("Cloudinary configured");
} else {
  logger.warn("Cloudinary disabled — attachment upload routes will 503.");
}

export { cloudinaryEnabled };
export default cloudinary;
