import mongoose from "mongoose";
import config from "./index";
import logger from "./logger";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | null = null;

const connectDb = async (): Promise<void> => {
    try {
        let uri = config.mongoUri;
        
        // Zero-setup fallback: if the URI is local and connecting fails, start an in-memory MongoDB
        if (uri.includes("localhost") || uri.includes("127.0.0.1")) {
            try {
                logger.info(`Attempting to connect to local MongoDB at: ${uri}`);
                const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
                logger.info(`MongoDB connected: ${conn.connection.host}`);
                return;
            } catch (err) {
                logger.warn("Local MongoDB server is not running. Starting zero-setup in-memory MongoDB server...");
                mongod = await MongoMemoryServer.create();
                uri = mongod.getUri();
                logger.info(`In-memory MongoDB server started successfully at: ${uri}`);
            }
        }

        const conn = await mongoose.connect(uri);
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error: any) {
        logger.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
}

export default connectDb;
