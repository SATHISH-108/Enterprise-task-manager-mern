import mongoose from "mongoose";
import env from "./env.js";
import logger from "./logger.js";

export const dbConnect = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);
    logger.info(
      `Mongo connected: ${conn.connection.host}/${conn.connection.name}`,
    );
    return conn;
  } catch (err) {
    logger.error("DB connection error:", err);
    process.exit(1);
  }
};

export default dbConnect;
