import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import mongoose from 'mongoose';
import config from '../../config';
import logger from '../../config/logger';

export class AIService {
    private graph: any;
    private checkpointer!: MongoDBSaver;
    private vectorStore!: MongoDBAtlasVectorSearch;

    constructor() {
        // We can initialize asynchronously when the first request comes
        // or trigger it right after instantiation.
    }

    public async init() {
        if (this.graph) return;

        try {
            if (mongoose.connection.readyState !== 1) {
                logger.warn("Mongoose not connected yet, waiting...");
            }
            
            const client = mongoose.connection.getClient() as any;
            const db = client.db();

            const collection = db.collection('content_vectors');
            this.vectorStore = new MongoDBAtlasVectorSearch(
                new GoogleGenerativeAIEmbeddings({ 
                    apiKey: config.geminiApiKey,
                    model: "text-embedding-004"
                }),
                {
                    collection,
                    indexName: "vector_index",
                    textKey: "text",
                    embeddingKey: "embedding",
                }
            );

            this.checkpointer = new MongoDBSaver({
                client,
                dbName: db.databaseName,
                checkpointCollectionName: 'langgraph_checkpoints',
                checkpointWritesCollectionName: 'langgraph_checkpoint_writes'
            });

            const llm = new ChatGoogleGenerativeAI({
                model: "gemini-2.5-flash",
                temperature: 0.7,
                apiKey: config.geminiApiKey,
            });

            const callModel = async (state: typeof MessagesAnnotation.State) => {
                const messages = state.messages;
                const response = await llm.invoke(messages);
                return { messages: [response] };
            };

            const workflow = new StateGraph(MessagesAnnotation)
                .addNode("agent", callModel)
                .addEdge(START, "agent")
                .addEdge("agent", END);

            this.graph = workflow.compile({ checkpointer: this.checkpointer });
            logger.info("AI Service with LangGraph, Gemini, and MongoDB initialized successfully.");
        } catch (error: any) {
            logger.error(`Failed to initialize AI Service: ${error.message}`);
        }
    }

    public async chat(userId: string, message: string) {
        if (!this.graph) {
            await this.init();
        }

        const configOptions = { configurable: { thread_id: userId } };
        
        const input = {
            messages: [{ role: "user", content: message }],
        };

        const result = await this.graph.invoke(input, configOptions);
        
        const finalMessage = result.messages[result.messages.length - 1];
        return finalMessage.content;
    }
}
