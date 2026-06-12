import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Annotation } from '@langchain/langgraph';
import mongoose from 'mongoose';
import config from '../../config';
import logger from '../../config/logger';

// ─── Content Plan Types ────────────────────────────────────────────────────────

export interface ContentPlan {
    intent: {
        topic: string;
        platform: string;
        format: string;
        audience: string;
        tone: string;
    };
    titles: Array<{ title: string; reason: string }>;
    metadata: {
        description: string;
        tags: string[];
        hashtags: string[];
    };
    script: {
        hook: string;
        mainPoints: Array<{ heading: string; content: string }>;
        cta: string;
    };
    thumbnailPrompt: string;
}

// ─── Pipeline State ────────────────────────────────────────────────────────────

const PipelineState = Annotation.Root({
    prompt: Annotation<string>,
    step: Annotation<string>({ reducer: (_, v) => v, default: () => 'start' }),
    intent: Annotation<ContentPlan['intent'] | null>({ reducer: (_, v) => v, default: () => null }),
    titles: Annotation<ContentPlan['titles']>({ reducer: (_, v) => v, default: () => [] }),
    metadata: Annotation<ContentPlan['metadata'] | null>({ reducer: (_, v) => v, default: () => null }),
    script: Annotation<ContentPlan['script'] | null>({ reducer: (_, v) => v, default: () => null }),
    thumbnailPrompt: Annotation<string>({ reducer: (_, v) => v, default: () => '' }),
    error: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
});

// ─── Mock Data (used when no API key is configured) ────────────────────────────

function generateMockPlan(prompt: string): ContentPlan {
    const topic = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
    return {
        intent: {
            topic: prompt,
            platform: 'youtube',
            format: 'video',
            audience: 'general audience interested in this topic',
            tone: 'engaging and informative',
        },
        titles: [
            { title: `The Ultimate Guide to ${topic}`, reason: 'Uses "Ultimate Guide" power words for high CTR' },
            { title: `${topic} — Everything You Need to Know in 2026`, reason: 'Year reference adds freshness and urgency' },
            { title: `I Tried ${topic} for 30 Days — Here's What Happened`, reason: 'Personal experiment format drives curiosity' },
            { title: `Why Nobody Talks About ${topic} (But Should)`, reason: 'Contrarian angle creates intrigue' },
            { title: `${topic}: 5 Mistakes Beginners Always Make`, reason: 'Mistake-avoidance format appeals to new learners' },
        ],
        metadata: {
            description: `In this video, we dive deep into ${prompt}. Whether you're a complete beginner or looking to level up, this comprehensive guide covers everything from fundamentals to advanced strategies. Don't forget to like, subscribe, and hit the bell icon for more content like this!\n\n⏱ Timestamps:\n0:00 Introduction\n1:30 Why This Matters\n3:45 Getting Started\n7:00 Advanced Tips\n10:30 Common Mistakes\n12:00 Final Thoughts`,
            tags: ['tutorial', 'guide', 'tips', 'how-to', 'beginner', 'advanced', '2026'],
            hashtags: ['#tutorial', '#howto', '#guide', '#tips', '#creator'],
        },
        script: {
            hook: `Have you ever wanted to master ${prompt} but didn't know where to start? In the next 10 minutes, I'm going to show you exactly how — and by the end of this video, you'll have everything you need to get started today.`,
            mainPoints: [
                {
                    heading: 'Why This Matters Right Now',
                    content: `Let's start with why ${prompt} is more relevant than ever. The landscape has changed dramatically, and those who understand this early will have a massive advantage...`,
                },
                {
                    heading: 'The Step-by-Step Approach',
                    content: `Here's my proven framework. Step one: understand the fundamentals. Step two: practice deliberately. Step three: get feedback and iterate...`,
                },
                {
                    heading: 'Common Mistakes to Avoid',
                    content: `Now let me save you months of frustration. The biggest mistake I see is people trying to do everything at once. Instead, focus on mastering one thing at a time...`,
                },
            ],
            cta: `If you found this helpful, smash that like button and subscribe for more content on ${prompt}. Drop a comment below telling me what topic you want me to cover next!`,
        },
        thumbnailPrompt: `A vibrant, eye-catching YouTube thumbnail about "${prompt}". Bold white text on a contrasting gradient background. Include a surprised/excited face expression cutout on the right side. Use bright orange and deep blue color scheme. Add subtle glow effects and arrows pointing to the main subject. Professional, clean design that pops at small sizes.`,
    };
}

// ─── JSON Extraction Helper ────────────────────────────────────────────────────

function extractJSON(text: string): any {
    // Try to find JSON in code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* fall through */ }
    }
    // Try to find raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
    // Try the full text
    try { return JSON.parse(text); } catch { /* fall through */ }
    return null;
}

// ─── AI Service ────────────────────────────────────────────────────────────────

export class AIService {
    private chatGraph: any;
    private contentGraph: any;
    private checkpointer!: MongoDBSaver;
    private llm: ChatGoogleGenerativeAI | null = null;
    private hasApiKey: boolean;

    constructor() {
        this.hasApiKey = !!config.geminiApiKey;
    }

    // ── Lazy-init the LLM ──────────────────────────────────────────────────────
    private getLLM(): ChatGoogleGenerativeAI {
        if (!this.llm) {
            this.llm = new ChatGoogleGenerativeAI({
                model: 'gemini-2.5-flash',
                temperature: 0.7,
                apiKey: config.geminiApiKey,
            });
        }
        return this.llm;
    }

    // ── Chat (existing functionality) ──────────────────────────────────────────
    public async init() {
        if (this.chatGraph) return;

        try {
            if (mongoose.connection.readyState !== 1) {
                logger.warn("Mongoose not connected yet, waiting...");
            }

            const client = mongoose.connection.getClient() as any;
            const db = client.db();

            this.checkpointer = new MongoDBSaver({
                client,
                dbName: db.databaseName,
                checkpointCollectionName: 'langgraph_checkpoints',
                checkpointWritesCollectionName: 'langgraph_checkpoint_writes'
            });

            const llm = this.getLLM();

            const callModel = async (state: typeof MessagesAnnotation.State) => {
                const messages = state.messages;
                const response = await llm.invoke(messages);
                return { messages: [response] };
            };

            const workflow = new StateGraph(MessagesAnnotation)
                .addNode("agent", callModel)
                .addEdge(START, "agent")
                .addEdge("agent", END);

            this.chatGraph = workflow.compile({ checkpointer: this.checkpointer });
            logger.info("AI Chat Service initialized successfully.");
        } catch (error: any) {
            logger.error(`Failed to initialize AI Chat Service: ${error.message}`);
        }
    }

    public async chat(userId: string, message: string) {
        if (!this.chatGraph) {
            await this.init();
        }

        const configOptions = { configurable: { thread_id: userId } };
        const input = { messages: [{ role: "user", content: message }] };
        const result = await this.chatGraph.invoke(input, configOptions);
        const finalMessage = result.messages[result.messages.length - 1];
        return finalMessage.content;
    }

    // ── Content Generation Pipeline ────────────────────────────────────────────

    public async generateContentPlan(userId: string, prompt: string): Promise<ContentPlan> {
        // If no API key, return a smart mock so UI development can proceed
        if (!this.hasApiKey) {
            logger.warn('No GEMINI_API_KEY configured — returning mock content plan.');
            return generateMockPlan(prompt);
        }

        const llm = this.getLLM();

        // Step 1: Parse intent
        logger.info(`[AI Pipeline] Step 1/5: Parsing intent for user ${userId}`);
        const intentResult = await llm.invoke([
            {
                role: 'system',
                content: `You are an expert content strategist. Analyze the user's content idea and extract structured information.
Return ONLY a valid JSON object with this exact schema:
{
  "topic": "the main topic/subject",
  "platform": "youtube" | "instagram" | "tiktok" | "twitter" | "linkedin",
  "format": "video" | "short" | "reel" | "article" | "podcast" | "thread",
  "audience": "target audience description",
  "tone": "content tone (e.g. educational, entertaining, motivational)"
}
Infer any missing details from context. Default platform is "youtube", default format is "video".`,
            },
            { role: 'user', content: prompt },
        ]);
        const intent = extractJSON(typeof intentResult.content === 'string' ? intentResult.content : '') || {
            topic: prompt, platform: 'youtube', format: 'video', audience: 'general', tone: 'engaging',
        };

        // Step 2: Generate titles
        logger.info(`[AI Pipeline] Step 2/5: Generating titles`);
        const titlesResult = await llm.invoke([
            {
                role: 'system',
                content: `You are a viral content title expert. Generate 5 compelling titles for the given content idea.
Return ONLY a valid JSON array with this schema:
[{ "title": "Title text", "reason": "Why this title works" }]
Use proven title formulas: numbers, power words, curiosity gaps, and emotional triggers.`,
            },
            { role: 'user', content: `Topic: ${intent.topic}\nPlatform: ${intent.platform}\nFormat: ${intent.format}\nAudience: ${intent.audience}\nTone: ${intent.tone}` },
        ]);
        const titlesRaw = extractJSON(typeof titlesResult.content === 'string' ? titlesResult.content : '');
        const titles: ContentPlan['titles'] = Array.isArray(titlesRaw)
            ? titlesRaw.slice(0, 5)
            : [{ title: intent.topic, reason: 'Based on your original prompt' }];

        // Step 3: Generate metadata (description, tags, hashtags)
        logger.info(`[AI Pipeline] Step 3/5: Generating metadata`);
        const metaResult = await llm.invoke([
            {
                role: 'system',
                content: `You are an SEO and social media metadata expert. Generate optimized metadata for the content.
Return ONLY a valid JSON object:
{
  "description": "A compelling, SEO-optimized description (200-300 words) with timestamps if video format",
  "tags": ["tag1", "tag2", ...],  // 8-15 relevant tags
  "hashtags": ["#hashtag1", "#hashtag2", ...]  // 5-8 trending hashtags
}`,
            },
            {
                role: 'user',
                content: `Topic: ${intent.topic}\nPlatform: ${intent.platform}\nFormat: ${intent.format}\nChosen Title: ${titles[0]?.title}\nAudience: ${intent.audience}`,
            },
        ]);
        const metadata = extractJSON(typeof metaResult.content === 'string' ? metaResult.content : '') || {
            description: `A comprehensive guide about ${intent.topic}`,
            tags: [intent.topic.toLowerCase()],
            hashtags: [`#${intent.topic.replace(/\s+/g, '').toLowerCase()}`],
        };

        // Step 4: Generate script outline
        logger.info(`[AI Pipeline] Step 4/5: Generating script outline`);
        const scriptResult = await llm.invoke([
            {
                role: 'system',
                content: `You are an expert content script writer. Create a structured script outline.
Return ONLY a valid JSON object:
{
  "hook": "An attention-grabbing opening (2-3 sentences that create curiosity)",
  "mainPoints": [
    { "heading": "Section heading", "content": "2-3 sentences of talking points" }
  ],
  "cta": "A compelling call-to-action closing (2-3 sentences)"
}
Include 3-5 main points. Make the hook irresistible and the CTA actionable.`,
            },
            {
                role: 'user',
                content: `Topic: ${intent.topic}\nTitle: ${titles[0]?.title}\nPlatform: ${intent.platform}\nTone: ${intent.tone}\nAudience: ${intent.audience}`,
            },
        ]);
        const script = extractJSON(typeof scriptResult.content === 'string' ? scriptResult.content : '') || {
            hook: `Let's dive into ${intent.topic}...`,
            mainPoints: [{ heading: 'Main Point', content: 'Key content here...' }],
            cta: 'Like and subscribe for more!',
        };

        // Step 5: Generate thumbnail prompt
        logger.info(`[AI Pipeline] Step 5/5: Generating thumbnail prompt`);
        const thumbResult = await llm.invoke([
            {
                role: 'system',
                content: `You are a YouTube thumbnail design expert. Generate a detailed text-to-image prompt for creating an eye-catching thumbnail.
Return ONLY a plain text string (NOT JSON). The prompt should describe:
- Visual composition and layout
- Color scheme (bold, contrasting colors)
- Text overlay suggestions
- Facial expressions or reactions if applicable
- Style (clean, professional, attention-grabbing)
Keep it under 150 words.`,
            },
            {
                role: 'user',
                content: `Title: ${titles[0]?.title}\nTopic: ${intent.topic}\nPlatform: ${intent.platform}`,
            },
        ]);
        const thumbnailPrompt = typeof thumbResult.content === 'string'
            ? thumbResult.content.replace(/```/g, '').trim()
            : `Eye-catching thumbnail for: ${titles[0]?.title}`;

        const plan: ContentPlan = { intent, titles, metadata, script, thumbnailPrompt };

        logger.info(`[AI Pipeline] ✅ Content plan generated successfully for user ${userId}`);
        return plan;
    }
}
