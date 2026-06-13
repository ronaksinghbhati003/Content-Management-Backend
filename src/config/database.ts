import mongoose from "mongoose";
import config from "./index";
import logger from "./logger";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | null = null;

const connectDb = async (): Promise<void> => {
    try {
        let uri = config.mongoUri;
        
        try {
            logger.info(`Attempting to connect to MongoDB at: ${uri}`);
            const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
            logger.info(`MongoDB connected: ${conn.connection.host}`);
            return;
        } catch (err: any) {
            logger.warn(`Failed to connect to MongoDB at configured URI (${err.message}). Starting zero-setup in-memory MongoDB server...`);
            mongod = await MongoMemoryServer.create();
            uri = mongod.getUri();
            logger.info(`In-memory MongoDB server started successfully at: ${uri}`);
            const conn = await mongoose.connect(uri);
            logger.info(`MongoDB connected (in-memory): ${conn.connection.host}`);
        }
    } catch (error: any) {
        logger.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
}

export default connectDb;
