import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Annotation } from '@langchain/langgraph';
import mongoose from 'mongoose';
import fs from 'fs';
import config from '../../config';
import logger from '../../config/logger';
import { BadRequestException } from '../../shared/http-exception';

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
const GEMINI_VISION_MODEL = 'gemini-2.5-flash';

// ─── Thumbnail Image Result ────────────────────────────────────────────────────

export interface GeneratedImage {
    buffer: Buffer;
    mimeType: string;
}

export type ThumbnailSize = 'youtube' | 'instagram_square' | 'instagram_reel';

// Pixel dimensions + a plain-English aspect-ratio hint (used to steer Gemini,
// which has no explicit width/height param — Pollinations gets the exact
// pixels since its API takes them directly).
const THUMBNAIL_SIZES: Record<ThumbnailSize, { width: number; height: number; ratioLabel: string }> = {
    youtube:           { width: 1280, height: 720,  ratioLabel: '16:9 landscape' },
    instagram_square:  { width: 1080, height: 1080, ratioLabel: '1:1 square' },
    instagram_reel:    { width: 1080, height: 1920, ratioLabel: '9:16 vertical' },
};

// Free, no API key required — used when Gemini has no key configured or its
// image quota/billing rejects the request. See image.pollinations.ai.
// It's a shared free service with no SLA, so it can occasionally take a while —
// give it more room than a typical API call before giving up.
async function generatePollinationsThumbnail(prompt: string, size: ThumbnailSize): Promise<GeneratedImage> {
    const { width, height } = THUMBNAIL_SIZES[size];
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&model=flux`;
    const res = await fetch(url, { signal: AbortSignal.timeout(55000) });
    if (!res.ok) {
        throw new BadRequestException(`Pollinations image API returned ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: res.headers.get('content-type') || 'image/jpeg',
    };
}

// ─── Face-Aware Crop Detection ─────────────────────────────────────────────────

// Reuses the same Gemini key already configured for thumbnail generation —
// no dedicated computer-vision dependency exists in this stack (no OpenCV, no
// Python, no face-api.js), so a vision-capable LLM call is the lowest-risk way
// to get an approximate face position without adding a fragile native install.
//
// Returns the median horizontal face position (0.0 = left edge, 1.0 = right
// edge) across every sampled frame that had a clear face, or null if no key is
// configured, no frames were found to have a face, or every request failed —
// callers should fall back to a plain center crop (0.5) in that case.
export async function detectFaceCenterX(framePaths: string[]): Promise<number | null> {
    if (!config.geminiApiKey || framePaths.length === 0) return null;

    const estimates: number[] = [];

    await Promise.all(framePaths.map(async (framePath) => {
        try {
            const base64 = fs.readFileSync(framePath).toString('base64');
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${config.geminiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { inlineData: { mimeType: 'image/jpeg', data: base64 } },
                                {
                                    text: 'Look at this video frame. If there is a clearly visible human face, respond with ONLY this JSON object (no markdown, no other text): {"faceFound": true, "centerX": 0.0} where centerX is the horizontal position of the PRIMARY (largest/most prominent) face\'s center as a fraction of the frame width, 0.0 = left edge, 1.0 = right edge. If no clear human face is visible, respond with ONLY {"faceFound": false}.',
                                },
                            ],
                        }],
                    }),
                    signal: AbortSignal.timeout(15000),
                }
            );
            if (!res.ok) return;

            const data: any = await res.json();
            const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) return;

            const parsed = JSON.parse(match[0]);
            if (parsed.faceFound && typeof parsed.centerX === 'number' && parsed.centerX >= 0 && parsed.centerX <= 1) {
                estimates.push(parsed.centerX);
            }
        } catch (err: any) {
            logger.warn(`[FaceDetect] Frame analysis failed for ${framePath}: ${err.message}`);
        }
    }));

    if (estimates.length === 0) return null;
    estimates.sort((a, b) => a - b);
    return estimates[Math.floor(estimates.length / 2)];
}

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

// ─── Research Workspace Types ──────────────────────────────────────────────────

export interface ResearchResult {
    titles: string[];
    scriptOutline: {
        hook: string;
        mainPoints: Array<{ heading: string; content: string }>;
        cta: string;
    };
    thumbnailIdeas: string[];
    trendingKeywords: string[];
    commonQuestions: string[];
    summary: {
        competition: 'Low' | 'Medium' | 'High';
        bestVideoLength: string;
        commonHook: string;
        opportunityScore: number;
        difficulty: 'Easy' | 'Medium' | 'Hard';
        audience: string;
        confidence: number;
    };
    recommendation: {
        idealLength: string;
        colorPalette: string;
        targetAudience: string;
        include: string[];
        avoid: string[];
    };
}

export interface ContentGap {
    covered: string[];
    gaps: Array<{ topic: string; opportunityScore: number }>;
    suggestedVideo: { title: string; opportunityScore: number };
}

export interface CompetitorVideo {
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnail: string;
    publishedAt: string;
    url: string;
    viewCount: number | null;
    duration: string | null;
}

function generateMockResearch(topic: string): ResearchResult {
    return {
        titles: [
            `The Ultimate Guide to ${topic}`,
            `${topic}: Everything You Need to Know in 2026`,
            `I Tried ${topic} for 30 Days — Here's What Happened`,
            `Why Nobody Talks About ${topic} (But Should)`,
            `${topic}: 5 Mistakes Beginners Always Make`,
        ],
        scriptOutline: {
            hook: `Have you ever wanted to understand ${topic} but didn't know where to start?`,
            mainPoints: [
                { heading: 'Why This Matters', content: `An overview of why ${topic} is relevant right now and who it's for.` },
                { heading: 'The Fundamentals', content: `The core concepts behind ${topic}, explained simply.` },
                { heading: 'Common Mistakes', content: `The most frequent mistakes beginners make with ${topic} and how to avoid them.` },
            ],
            cta: `If this helped, subscribe for more content on ${topic}.`,
        },
        thumbnailIdeas: [
            `Bold text "${topic}" over a high-contrast gradient background`,
            `Before/after split screen related to ${topic}`,
            `Shocked reaction face with a big number or stat about ${topic}`,
            `Clean minimal thumbnail with a single key visual for ${topic}`,
        ],
        trendingKeywords: [topic, `${topic} tutorial`, `${topic} for beginners`, `${topic} tips`, `${topic} guide`, `learn ${topic}`, `${topic} explained`, `${topic} 2026`],
        commonQuestions: [
            `What is ${topic}?`,
            `How do I get started with ${topic}?`,
            `Is ${topic} worth learning in 2026?`,
            `What are common mistakes with ${topic}?`,
            `How long does it take to learn ${topic}?`,
            `What tools do I need for ${topic}?`,
        ],
        summary: {
            competition: 'Medium',
            bestVideoLength: '8-12 min',
            commonHook: `"Everything you need to know about ${topic}"`,
            opportunityScore: 68,
            difficulty: 'Medium',
            audience: `Beginners interested in ${topic}`,
            confidence: 60,
        },
        recommendation: {
            idealLength: '10-12 min',
            colorPalette: 'Yellow + Blue, high contrast',
            targetAudience: `Beginners exploring ${topic}`,
            include: ['A clear step-by-step structure', 'A real example or mini project', 'A strong hook in the first 10 seconds'],
            avoid: ['Overly advanced jargon without explanation', 'Slow, unstructured intros'],
        },
    };
}

function generateMockContentGap(topic: string): ContentGap {
    return {
        covered: [`${topic} basics`, `${topic} fundamentals`, `Getting started with ${topic}`],
        gaps: [
            { topic: `${topic} common mistakes`, opportunityScore: 82 },
            { topic: `${topic} debugging/troubleshooting`, opportunityScore: 78 },
            { topic: `${topic} real-world project walkthrough`, opportunityScore: 74 },
        ],
        suggestedVideo: { title: `${topic}: Mistakes Nobody Warns You About`, opportunityScore: 88 },
    };
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

// ─── Duration Parsing Helper ────────────────────────────────────────────────────

function parseISO8601Duration(iso: string): string {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

    // ── Title Suggestions (quick, single-step) ─────────────────────────────────

    public async generateSuggestions(userId: string, type: string, prompt: string, wordCount?: number, description?: string): Promise<string[]> {
        if (type !== 'title' && type !== 'description' && type !== 'script') return [];

        const hasTitleContext = prompt && prompt.trim().length > 0;

        // ── Mock fallback (no API key) ─────────────────────────────────────────
        if (!this.hasApiKey) {
            const topic = hasTitleContext ? prompt.trim() : 'your content idea';
            if (type === 'title') {
                const fixed = hasTitleContext
                    ? prompt.trim().replace(/\b\w/g, c => c.toUpperCase())
                    : null;
                return [
                    fixed || `The Ultimate Guide to ${topic}`,
                    `${topic} — Everything You Need to Know in 2026`,
                    `I Tried ${topic} for 30 Days — Here's What Happened`,
                    `Why Nobody Talks About ${topic} (But Should)`,
                ].slice(0, 4);
            }
            // script mock
            if (type === 'script') {
                return [
                    `[HOOK]\nHave you ever struggled with ${topic}? In the next few minutes, I'm going to show you exactly how to master it — step by step, no fluff.\n\n[INTRO]\nWelcome back! Today we're diving deep into ${topic}. Whether you're a complete beginner or looking to level up, this video is for you.\n\n[MAIN POINT 1 — The Basics]\nLet's start from the beginning. ${topic} is essentially about... [explain core concept]. Most people skip this part, and that's exactly why they struggle later.\n\n[MAIN POINT 2 — The Right Approach]\nNow here's what actually works. Instead of [common mistake], you want to [correct approach]. I've tested this myself and the results speak for themselves.\n\n[MAIN POINT 3 — Pro Tips]\nThree things that will save you hours: First... Second... Third... Trust me, these make a massive difference.\n\n[CTA]\nIf this was helpful, smash that like button and subscribe — I post new videos every week. Drop a comment below with your biggest question about ${topic} and I'll answer it in the next video. See you there!`,
                    `[HOOK — Question]\nWhat if I told you there's a smarter way to approach ${topic}? One that most people overlook entirely? Stay with me — this changes everything.\n\n[INTRO]\nHey, welcome back. Today's video is one I've been meaning to make for a long time. We're talking about ${topic} — specifically, the parts nobody talks about.\n\n[SECTION 1 — Why This Matters]\nHere's the thing about ${topic}: it's not just about [surface-level thing]. It goes deeper than that. Let me show you what I mean.\n\n[SECTION 2 — The Framework]\nI use a simple three-step framework. Step one: [action]. Step two: [action]. Step three: [action]. Once you get this, everything else clicks into place.\n\n[SECTION 3 — Common Mistakes]\nBefore I wrap up, let's talk about the mistakes I see all the time. Number one... Number two... Number three... Avoid these and you're already ahead of 90% of people.\n\n[OUTRO]\nAlright, that's a wrap! If you want part two of this series, let me know in the comments. Like, subscribe, and I'll see you in the next one.`,
                ];
            }
            // description mock
            return [
                `In this video, we dive deep into ${topic} — covering everything from the basics to advanced strategies that actually work in 2026.\n\nWhether you're just starting out or looking to level up, this is the guide you've been waiting for. We break down the most important concepts, show you real examples, and walk you through every step.\n\n⏱ TIMESTAMPS\n0:00 — Introduction\n1:30 — Why ${topic} matters right now\n4:00 — Step-by-step breakdown\n8:30 — Common mistakes to avoid\n12:00 — Pro tips & tricks\n15:00 — Final thoughts\n\n🔔 Subscribe for more content like this!\n👍 Like if this helped you\n💬 Drop your questions in the comments\n\n#${topic.replace(/\s+/g, '')} #tutorial #howto #tips`,
                `Everything you need to know about ${topic}, explained simply and clearly. No fluff, no filler — just the stuff that works.\n\nIn this video I cover:\n✅ What ${topic} actually is and why it matters\n✅ The biggest mistakes beginners make\n✅ A proven framework you can use today\n✅ Real-world examples and case studies\n\n⏱ TIMESTAMPS\n0:00 — Intro\n2:00 — The basics\n5:30 — Framework walkthrough\n9:00 — Examples\n13:00 — Wrap-up\n\n📌 Save this video for later!\n\n#${topic.replace(/\s+/g, '')} #guide #contentcreator`,
                `A complete breakdown of ${topic}: the key insights, the common pitfalls, and the actionable steps you can start using immediately.\n\nI've spent months researching and testing everything around ${topic} so you don't have to. In this video I'm sharing everything — including the mistakes I made so you can skip straight to what works.\n\n⏱ TIMESTAMPS\n0:00 — Why I made this video\n1:45 — The fundamentals\n4:30 — What most people get wrong\n7:00 — The right approach\n11:00 — Advanced strategies\n14:30 — Your next steps\n\n🔗 Resources mentioned are in the pinned comment.\n\n#${topic.replace(/\s+/g, '')} #deepdive #tutorial`,
                `Discover the most effective strategies around ${topic} and learn how to apply them for real, measurable results.\n\nThis isn't theory — everything in this video is based on what's actually working right now. I'll walk you through the exact process I use, step by step, with no steps skipped.\n\nWhat you'll learn:\n→ The core principles behind ${topic}\n→ How to get started even if you're a complete beginner\n→ The shortcut most people miss\n→ How to scale once you have the basics down\n\n⏱ TIMESTAMPS\n0:00 — Overview\n2:15 — Core principles\n6:00 — Getting started\n9:30 — The shortcut\n12:45 — Scaling up\n16:00 — Q&A\n\n#${topic.replace(/\s+/g, '')} #strategy #results`,
            ];
        }

        const llm = this.getLLM();

        // ── Title suggestions ─────────────────────────────────────────────────
        if (type === 'title') {
            const systemPrompt = hasTitleContext
                ? `You are a content title editor. The user has written a title that may have spelling mistakes, wrong capitalization, or grammar issues.
Your tasks:
1. Correct the original title: fix all spelling mistakes, apply proper title case, fix grammar — stay close to the original meaning
2. Generate 3 more creative alternative titles on the same topic using viral formulas

Return ONLY a JSON array of exactly 4 strings (no extra text, no markdown):
["Corrected original title", "Creative alternative 2", "Creative alternative 3", "Creative alternative 4"]

The first item MUST be the corrected/improved version of the user's input.`
                : `You are a viral content title expert. Generate exactly 4 compelling titles for the given topic or context.
Return ONLY a JSON array of exactly 4 strings (no extra text, no markdown):
["Title 1", "Title 2", "Title 3", "Title 4"]
Use proven formulas: numbers, power words, curiosity gaps, emotional triggers.`;

            const userContent = hasTitleContext
                ? `User's title (fix spelling/casing, then give 3 alternatives): "${prompt}"`
                : prompt
                    ? `Content topic/context: ${prompt}`
                    : 'Generate 4 creative content titles for a content creator';

            logger.info(`[AI Suggest] Generating title suggestions for user ${userId}, hasTitleContext=${hasTitleContext}`);

            const result = await llm.invoke([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ]);

            const raw = extractJSON(typeof result.content === 'string' ? result.content : '');
            if (Array.isArray(raw) && raw.length > 0) return raw.slice(0, 4).map(String);

            const topic = prompt.trim() || 'Content';
            return hasTitleContext
                ? [
                    prompt.trim().replace(/\b\w/g, c => c.toUpperCase()),
                    `The Ultimate Guide to ${topic}`,
                    `How to Master ${topic} in 2026`,
                    `${topic}: Everything You Need to Know`,
                  ]
                : [
                    'The Ultimate Creator Guide 2026',
                    'Top 10 Tips That Actually Work',
                    'How to Grow Your Audience Fast',
                    "The Creator's Blueprint: Start Here",
                  ];
        }

        // ── Script suggestions ────────────────────────────────────────────────
        if (type === 'script') {
            return this.generateScriptSuggestions(userId, prompt, description || '');
        }

        // ── Description suggestions (prompt = title as context) ───────────────
        const targetWords = wordCount ?? 200;
        logger.info(`[AI Suggest] Generating description suggestions for user ${userId}, title="${prompt}", wordCount=${targetWords}`);

        const descResult = await llm.invoke([
            {
                role: 'system',
                content: `You are an expert YouTube and social media copywriter. Generate exactly 4 full-length content descriptions for the given title.

Each description should be approximately ${targetWords} words and written in a different style:
1. Informative & educational — explains what viewers will learn, step by step
2. Storytelling & curiosity — opens with a hook, builds intrigue, reads like a narrative
3. Benefit-focused & punchy — bullet points, value propositions, direct tone
4. Conversational & personal — feels like the creator is talking directly to their audience

Each description MUST include:
- A strong opening paragraph (2–3 sentences)
- A "What you'll learn" or timestamp section (use ⏱ TIMESTAMPS with fake but realistic time codes)
- A call to action (subscribe, like, comment)
- 3–5 relevant hashtags at the end

Return ONLY a JSON array of exactly 4 strings. Use \\n for line breaks inside each string. No extra text outside the array:
["Full description 1", "Full description 2", "Full description 3", "Full description 4"]`,
            },
            {
                role: 'user',
                content: hasTitleContext
                    ? `Content title: "${prompt}"`
                    : 'Generate 4 full YouTube-style descriptions for a general content creator video',
            },
        ]);

        const descRaw = extractJSON(typeof descResult.content === 'string' ? descResult.content : '');
        if (Array.isArray(descRaw) && descRaw.length > 0) return descRaw.slice(0, 4).map(String);

        const t = prompt.trim() || 'this topic';
        return [
            `In this video, we dive deep into ${t} — covering everything from the basics to advanced strategies that actually work.\n\nWhether you're just starting out or looking to level up, this is the guide you've been waiting for.\n\n⏱ TIMESTAMPS\n0:00 — Introduction\n2:00 — The basics\n6:00 — Step-by-step walkthrough\n10:00 — Pro tips\n14:00 — Final thoughts\n\n🔔 Subscribe for more!\n👍 Like if this helped\n\n#${t.replace(/\s+/g, '')} #tutorial #howto`,
            `What if everything you knew about ${t} was only half the story?\n\nIn this video I break down the full picture — the parts most people skip, the mistakes that cost time and money, and the exact steps I wish I had when I started.\n\n⏱ TIMESTAMPS\n0:00 — Intro\n1:30 — The missing piece\n5:00 — Real examples\n9:30 — The right approach\n13:00 — Wrap-up\n\n💬 Drop your questions below!\n\n#${t.replace(/\s+/g, '')} #guide #creator`,
            `Here's everything you get in this video:\n✅ A clear breakdown of ${t}\n✅ Common mistakes and how to avoid them\n✅ A proven framework you can use today\n✅ Real examples with results\n\n⏱ TIMESTAMPS\n0:00 — Overview\n3:00 — Framework\n7:00 — Examples\n11:00 — Mistakes to avoid\n15:00 — Next steps\n\n📌 Save this for later!\n\n#${t.replace(/\s+/g, '')} #tips #results`,
            `Hey! In today's video I'm sharing everything I know about ${t}. I've spent a lot of time testing different approaches and I'm going to walk you through exactly what worked.\n\nNo fluff, no filler — just the stuff that makes a real difference.\n\n⏱ TIMESTAMPS\n0:00 — Why I made this\n2:00 — What I learned\n5:30 — The process\n9:00 — Results\n12:30 — Your turn\n\n🔔 Subscribe so you don't miss part 2!\n\n#${t.replace(/\s+/g, '')} #contentcreator #tutorial`,
        ];
    }

    // ── Script suggestions (prompt = title, description = content description) ──
    private async generateScriptSuggestions(userId: string, title: string, description: string): Promise<string[]> {
        logger.info(`[AI Suggest] Generating script suggestions for user ${userId}, title="${title}"`);

        const llm = this.getLLM();

        const contextBlock = [
            title ? `Title: "${title}"` : '',
            description ? `Description:\n${description}` : '',
        ].filter(Boolean).join('\n\n');

        const scriptResult = await llm.invoke([
            {
                role: 'system',
                content: `You are a professional video script writer. Generate exactly 2 full video scripts based on the title and description provided.

Each script must include all of these clearly labeled sections:
[HOOK] — 2–3 sentences to grab attention in the first 5 seconds
[INTRO] — Welcome viewers, introduce yourself and the topic (3–5 sentences)
[MAIN POINT 1] — First key section with a heading, detailed talking points
[MAIN POINT 2] — Second key section with a heading, detailed talking points
[MAIN POINT 3] — Third key section with a heading, detailed talking points
[CTA] — Call to action: like, subscribe, comment prompt

Script 1 should be energetic and fast-paced.
Script 2 should be calm, educational, and conversational.

Both scripts must be directly based on the title and description — do not invent unrelated topics.

Return ONLY a JSON array of exactly 2 strings. Use \\n for line breaks. No extra text outside the array:
["Full script 1", "Full script 2"]`,
            },
            {
                role: 'user',
                content: contextBlock || 'Write a script for a general content creator video',
            },
        ]);

        const raw = extractJSON(typeof scriptResult.content === 'string' ? scriptResult.content : '');
        if (Array.isArray(raw) && raw.length > 0) return raw.slice(0, 2).map(String);

        const t = title || 'this topic';
        return [
            `[HOOK]\nHave you ever struggled with ${t}? In the next few minutes I'm going to walk you through exactly how to handle it.\n\n[INTRO]\nWelcome back! Today we're covering ${t} — and I promise this is going to be the clearest explanation you've seen.\n\n[MAIN POINT 1 — The Basics]\n${description ? description.slice(0, 150) + '...' : `Let's start with the fundamentals of ${t}.`}\n\n[MAIN POINT 2 — The Right Approach]\nHere's what most people get wrong and how to fix it.\n\n[MAIN POINT 3 — Pro Tips]\nThree things that will save you hours of trial and error.\n\n[CTA]\nIf this helped, like and subscribe. Comment your biggest question below and I'll answer it next week!`,
            `[HOOK]\nWhat if there was a simpler way to approach ${t}? There is — and I'm going to show you today.\n\n[INTRO]\nHey, welcome. Let's talk about ${t}. I'll keep it simple and practical.\n\n[MAIN POINT 1 — Understanding the Concept]\n${description ? description.slice(0, 150) + '...' : `First, let's define what ${t} really means.`}\n\n[MAIN POINT 2 — Step-by-Step Process]\nHere's the exact process I recommend, broken into clear steps.\n\n[MAIN POINT 3 — Common Mistakes]\nAvoid these mistakes and you'll be ahead of 90% of people.\n\n[CTA]\nSubscribe for more videos like this. See you in the next one!`,
        ];
    }

    // ── Thumbnail Image Generation ─────────────────────────────────────────────

    public async generateThumbnailImage(userId: string, prompt: string, size: ThumbnailSize = 'youtube'): Promise<GeneratedImage> {
        if (!this.hasApiKey) {
            logger.info(`[AI Thumbnail] No GEMINI_API_KEY configured, using Pollinations for user ${userId}`);
            return generatePollinationsThumbnail(prompt, size);
        }

        try {
            logger.info(`[AI Thumbnail] Generating image via Gemini for user ${userId}`);
            const { ratioLabel } = THUMBNAIL_SIZES[size];

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${config.geminiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `Create a vibrant, high-CTR YouTube/social media thumbnail image: ${prompt}. Bold, eye-catching, professional composition. The image MUST be composed in a ${ratioLabel} aspect ratio.`,
                            }],
                        }],
                    }),
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data: any = await res.json();

            if (!res.ok) {
                throw new Error(data?.error?.message || `Gemini image API returned ${res.status}`);
            }

            const parts = data?.candidates?.[0]?.content?.parts || [];
            const imagePart = parts.find((p: any) => p.inlineData?.data);

            if (!imagePart) {
                throw new Error('Gemini did not return an image for this prompt.');
            }

            return {
                buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
                mimeType: imagePart.inlineData.mimeType || 'image/png',
            };
        } catch (err: any) {
            logger.warn(`[AI Thumbnail] Gemini failed (${err.message}), falling back to Pollinations for user ${userId}`);
            return generatePollinationsThumbnail(prompt, size);
        }
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

        // Steps 3-5: metadata, script outline, and thumbnail prompt are all independent
        // of each other (they only depend on intent + the chosen title from step 2), so
        // run them concurrently instead of awaiting each one in sequence — this cuts the
        // pipeline from 5 sequential LLM round-trips down to effectively 3.
        logger.info(`[AI Pipeline] Steps 3-5/5: Generating metadata, script outline, and thumbnail prompt in parallel`);
        const [metaResult, scriptResult, thumbResult] = await Promise.all([
            llm.invoke([
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
            ]),
            llm.invoke([
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
            ]),
            llm.invoke([
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
            ]),
        ]);
        const metadata = extractJSON(typeof metaResult.content === 'string' ? metaResult.content : '') || {
            description: `A comprehensive guide about ${intent.topic}`,
            tags: [intent.topic.toLowerCase()],
            hashtags: [`#${intent.topic.replace(/\s+/g, '').toLowerCase()}`],
        };
        const script = extractJSON(typeof scriptResult.content === 'string' ? scriptResult.content : '') || {
            hook: `Let's dive into ${intent.topic}...`,
            mainPoints: [{ heading: 'Main Point', content: 'Key content here...' }],
            cta: 'Like and subscribe for more!',
        };
        const thumbnailPrompt = typeof thumbResult.content === 'string'
            ? thumbResult.content.replace(/```/g, '').trim()
            : `Eye-catching thumbnail for: ${titles[0]?.title}`;

        const plan: ContentPlan = { intent, titles, metadata, script, thumbnailPrompt };

        logger.info(`[AI Pipeline] ✅ Content plan generated successfully for user ${userId}`);
        return plan;
    }

    // ── Script Rewrite ──────────────────────────────────────────────────────────

    public async rewriteScript(userId: string, text: string, tone?: string, instruction?: string): Promise<string> {
        const toneLabel = tone || 'engaging';

        if (!this.hasApiKey) {
            logger.warn('No GEMINI_API_KEY configured — returning lightly-modified mock rewrite.');
            const prefix = instruction ? `[${toneLabel}, ${instruction}] ` : `[${toneLabel} rewrite] `;
            return `${prefix}${text}`;
        }

        logger.info(`[AI Rewrite] Rewriting script for user ${userId}, tone=${toneLabel}`);

        const llm = this.getLLM();
        const result = await llm.invoke([
            {
                role: 'system',
                content: `You are a professional script editor. Rewrite the given script text in a ${toneLabel} tone${instruction ? `, following this instruction: ${instruction}` : ''}. Keep the same meaning, length in the same ballpark, and don't add commentary. Return ONLY the rewritten text — no preamble, no markdown, no quotes around it.`,
            },
            { role: 'user', content: text },
        ]);

        const rewritten = typeof result.content === 'string' ? result.content.trim() : text;
        return rewritten || text;
    }

    // ── Highlight Suggestions ───────────────────────────────────────────────────

    public async suggestHighlights(userId: string, text: string): Promise<string[]> {
        if (!this.hasApiKey) {
            logger.warn('No GEMINI_API_KEY configured — returning heuristic mock highlights.');
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            const picks = sentences.filter((s, i) => i === 0 || /!|\d/.test(s)).map(s => s.trim());
            return [...new Set(picks)].slice(0, 6);
        }

        logger.info(`[AI Highlights] Finding key lines for user ${userId}`);

        const llm = this.getLLM();
        const result = await llm.invoke([
            {
                role: 'system',
                content: `You are a script editor identifying the most important lines in a video script — hooks, calls-to-action, key stats, or standout claims. Return ONLY a JSON array of up to 6 short EXACT substrings copied verbatim from the input text (no paraphrasing, must match the original text exactly so they can be located). No extra text outside the array: ["exact substring 1", "exact substring 2"]`,
            },
            { role: 'user', content: text },
        ]);

        const raw = extractJSON(typeof result.content === 'string' ? result.content : '');
        if (Array.isArray(raw)) {
            return raw.map(String).filter(s => text.includes(s)).slice(0, 6);
        }
        return [];
    }

    // ── Research Workspace ──────────────────────────────────────────────────────

    public async generateResearch(userId: string, topic: string): Promise<ResearchResult> {
        if (!this.hasApiKey) {
            logger.warn('No GEMINI_API_KEY configured — returning mock research.');
            return generateMockResearch(topic);
        }

        logger.info(`[AI Research] Generating research for user ${userId}, topic="${topic}"`);

        const llm = this.getLLM();
        const result = await llm.invoke([
            {
                role: 'system',
                content: `You are a content research assistant for a video creator. Given a topic, return ONLY a valid JSON object with this exact schema:
{
  "titles": ["5 compelling video title options for this topic"],
  "scriptOutline": {
    "hook": "an attention-grabbing opening line",
    "mainPoints": [{ "heading": "section heading", "content": "2-3 sentences of talking points" }],
    "cta": "a call-to-action closing line"
  },
  "thumbnailIdeas": ["4 short text descriptions of distinct thumbnail concepts"],
  "trendingKeywords": ["8-12 relevant search/SEO keywords for this topic"],
  "commonQuestions": ["6-8 questions people commonly ask about this topic"],
  "summary": {
    "competition": "Low" | "Medium" | "High" — your read of how saturated this topic is on YouTube,
    "bestVideoLength": "a short range like '8-12 min'",
    "commonHook": "the opening line/pattern most existing videos on this topic use",
    "opportunityScore": a number 0-100 estimating how good an opportunity this topic is (higher = more upside vs competition),
    "difficulty": "Easy" | "Medium" | "Hard" — how hard this topic is to produce well,
    "audience": "a short description of who this content is for",
    "confidence": a number 0-100 for how confident you are in this analysis (lower if the topic is very niche or ambiguous)
  },
  "recommendation": {
    "idealLength": "a short range like '10-12 min'",
    "colorPalette": "a short suggested thumbnail color scheme, e.g. 'Yellow + Blue, high contrast'",
    "targetAudience": "a short description of who to target",
    "include": ["2-4 short concrete things this video should include"],
    "avoid": ["1-3 short concrete things this video should avoid"]
  }
}
Include 3-5 mainPoints in scriptOutline. Be specific to the topic, not generic.`,
            },
            { role: 'user', content: `Topic: ${topic}` },
        ]);

        const raw = extractJSON(typeof result.content === 'string' ? result.content : '');
        if (raw && raw.titles && raw.scriptOutline) {
            const mock = generateMockResearch(topic);
            return { ...raw, summary: raw.summary || mock.summary, recommendation: raw.recommendation || mock.recommendation } as ResearchResult;
        }
        logger.warn('[AI Research] Failed to parse structured research response, falling back to mock.');
        return generateMockResearch(topic);
    }

    // ── Content Gap Analysis ────────────────────────────────────────────────────

    public async generateContentGap(userId: string, topic: string, competitorTitles: string[], keywords: string[]): Promise<ContentGap> {
        if (!this.hasApiKey) {
            return generateMockContentGap(topic);
        }

        try {
            const llm = this.getLLM();
            const result = await llm.invoke([
                {
                    role: 'system',
                    content: `You are a YouTube content strategist. Given a topic, a list of existing competitor video titles (may be empty), and trending keywords, identify what subtopics are already well-covered vs. underserved ("content gaps") that a new creator could win with. Return ONLY a valid JSON object with this exact schema:
{
  "covered": ["3-5 short subtopics that competitor videos already cover heavily"],
  "gaps": [{ "topic": "a short underserved subtopic", "opportunityScore": a number 0-100 }],
  "suggestedVideo": { "title": "one specific video title idea targeting the biggest gap", "opportunityScore": a number 0-100 }
}
Include 3-5 items in "gaps", ordered by opportunityScore descending. Be specific to the topic, not generic.`,
                },
                { role: 'user', content: `Topic: ${topic}\nCompetitor video titles: ${competitorTitles.length ? competitorTitles.join(' | ') : '(none available)'}\nTrending keywords: ${keywords.join(', ')}` },
            ]);
            const raw = extractJSON(typeof result.content === 'string' ? result.content : '');
            if (raw && Array.isArray(raw.gaps) && raw.suggestedVideo) {
                return raw as ContentGap;
            }
        } catch (err: any) {
            logger.warn(`[AI Research] Content gap generation failed: ${err.message}`);
        }
        return generateMockContentGap(topic);
    }

    // ── YouTube Search Query Refinement (disambiguates common-word topics, e.g. "react") ──

    public async refineYouTubeQuery(topic: string): Promise<string> {
        if (!this.hasApiKey) {
            return topic;
        }

        try {
            const llm = this.getLLM();
            const result = await llm.invoke([
                {
                    role: 'system',
                    content: `You're finding "competitor" videos for a creator's content-research tool. The input topic is often a rough idea, a full sentence, or a question about a content niche — NOT already a clean search query (e.g. "can we make videos on bgmi", "is cooking content still worth it").

Extract the core subject/niche and produce a short, high-signal YouTube search query (2-5 words) that surfaces REAL EXISTING VIDEOS already published in that niche — the videos a creator would study as competition.

Rules:
- Strip conversational/question framing ("can we make videos on X", "is it worth making content about X", "how to start a channel about X") down to just the subject X, then phrase it the way real creators/viewers describe that niche's content (e.g. "bgmi" -> "BGMI gameplay", "cooking" -> "cooking recipes").
- Do NOT add "tutorial" or "how to" unless the ORIGINAL topic was explicitly asking for a how-to/tutorial format.
- If the subject is itself an ambiguous common word (e.g. "react" the verb vs. React the JS library), add ONE clarifying word.
- Never search for the meta-question itself (e.g. never search "how to start a bgmi channel" when the topic is about whether it's worth starting one) — search for the niche's actual content instead.

Return ONLY the search query text — no quotes, no explanation, no punctuation beyond the query itself.`,
                },
                { role: 'user', content: `Topic: ${topic}` },
            ]);
            const query = (typeof result.content === 'string' ? result.content : '').trim().replace(/^["']|["']$/g, '');
            return query || topic;
        } catch (err: any) {
            logger.warn(`[AI Research] Query refinement failed: ${err.message}`);
            return topic;
        }
    }

    // ── Competitor Videos (YouTube Data API, no OAuth required) ────────────────

    public async fetchCompetitorVideos(topic: string): Promise<CompetitorVideo[]> {
        if (!config.youtubeApiKey) {
            logger.warn('[AI Research] No YOUTUBE_API_KEY configured — skipping competitor video lookup.');
            return [];
        }

        // Relevance-filter first, then rank by performance — NOT the other way
        // around. `order=viewCount` sorts purely by view count with no guarantee
        // the result actually matches the topic, which was surfacing loosely-
        // related mega-viral videos (e.g. a random tech video for a gaming-niche
        // topic) ahead of genuinely on-topic ones. Fetching a wider pool with
        // YouTube's relevance ranking first, then re-ranking THAT pool by view
        // count, gives "best-performing among actually relevant" instead of
        // "best-performing regardless of relevance".
        const POOL_SIZE = 15;
        const SHOWN_COUNT = 6;

        try {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=${POOL_SIZE}&q=${encodeURIComponent(topic)}&key=${config.youtubeApiKey}`;
            const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
            if (!searchRes.ok) {
                const errText = await searchRes.text();
                logger.warn(`[AI Research] YouTube search failed: ${searchRes.status} ${errText.slice(0, 300)}`);
                return [];
            }
            const searchData: any = await searchRes.json();
            const videos: CompetitorVideo[] = (searchData.items || []).map((item: any) => ({
                videoId: item.id?.videoId,
                title: item.snippet?.title,
                channelTitle: item.snippet?.channelTitle,
                thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
                publishedAt: item.snippet?.publishedAt,
                url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
                viewCount: null,
                duration: null,
            })).filter((v: CompetitorVideo) => !!v.videoId);

            if (videos.length === 0) return videos;

            const ids = videos.map(v => v.videoId).join(',');
            const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids}&key=${config.youtubeApiKey}`;
            const statsRes = await fetch(statsUrl, { signal: AbortSignal.timeout(10000) });
            if (!statsRes.ok) {
                logger.warn(`[AI Research] YouTube stats lookup failed: ${statsRes.status}`);
                return videos.slice(0, SHOWN_COUNT);
            }
            const statsData: any = await statsRes.json();
            const statsById = new Map<string, any>((statsData.items || []).map((item: any) => [item.id, item]));

            const withStats = videos.map(v => {
                const stats = statsById.get(v.videoId);
                return {
                    ...v,
                    viewCount: stats?.statistics?.viewCount ? Number(stats.statistics.viewCount) : null,
                    duration: stats?.contentDetails?.duration ? parseISO8601Duration(stats.contentDetails.duration) : null,
                };
            });

            return withStats
                .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
                .slice(0, SHOWN_COUNT);
        } catch (err: any) {
            logger.warn(`[AI Research] Competitor video lookup error: ${err.message}`);
            return [];
        }
    }
}
