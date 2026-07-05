# AI Agent Integration Architecture for CMS

This document outlines the architectural plan and technical setup required to integrate an autonomous AI agent into your Content Management System. The AI agent will assist users in generating content scripts, orchestrating workflows, and scheduling/publishing to platforms like YouTube and Instagram.

## User Review Required

> [!IMPORTANT]
> Since this is a high-level architecture overview, I need your feedback on the proposed technology stack (e.g., Vector DB choice, model providers, and message queue system) before we proceed with creating the underlying infrastructure.

---

## 1. Core Architecture Components

To achieve an autonomous, stateful AI agent capable of tool execution and RAG, we will split the AI system into four core layers:

1. **Agent Orchestrator:** The reasoning engine that decides which tools to call and what data to retrieve.
2. **Stateful Memory System:** Short-term memory (session history) and long-term memory (user preferences, past successful content).
3. **RAG Pipeline (Retrieval-Augmented Generation):** The knowledge base containing user documents, brand guidelines, and platform best practices.
4. **Tool Execution Engine:** The interface that allows the AI to interact with your CMS workflows (scheduling, posting to YT/Insta).

---

## 2. Technology Stack Recommendations

*   **LLM Provider:** **OpenAI (GPT-4o)** or **Anthropic (Claude 3.5 Sonnet)**. They offer the most robust and reliable function/tool calling capabilities.
*   **Orchestration Framework:** **LangChain.js** (specifically **LangGraph.js** for stateful, multi-step agent workflows). It natively supports complex tool loop reasoning.
*   **Vector Database (for RAG):** **Qdrant**, **Pinecone**, or **PgVector** (if migrating to Postgres). Since you are using Mongoose, MongoDB Atlas Vector Search is highly recommended as it integrates seamlessly with your existing DB.
*   **Message Broker (for async workflows):** **RabbitMQ** (which you may already have) or **BullMQ** (Redis-based) to handle long-running AI streaming requests and scheduled jobs without blocking the Express thread.

---

## 3. Directory Structure Integration

We will encapsulate all AI logic within a new module inside your existing Express backend to maintain your scalable architecture.

### New Module Setup

#### [NEW] src/modules/ai/ai.module.ts (Concept)
The entry point for the AI module, integrating with Express.

#### [NEW] src/modules/ai/agent.service.ts
The core agent loop. It will receive user prompts, load history, inject RAG context, and loop through tool calls until a final answer is generated.

#### [NEW] src/modules/ai/tools/
Dedicated folder for AI Tools.
*   `youtube.tool.ts` (AI tool to draft/schedule YT content)
*   `instagram.tool.ts` (AI tool to format Insta captions/scheduling)
*   `workflow.tool.ts` (AI tool to trigger CMS scheduling workflows)

#### [NEW] src/modules/ai/rag.service.ts
Handles embedding user uploaded documents (PDFs, brand guidelines) into the Vector DB and retrieving them based on semantic similarity.

#### [NEW] src/modules/ai/memory.service.ts
Manages MongoDB schemas for storing conversation history (`HumanMessage`, `AIMessage`, `ToolMessage`) to maintain stateful context.

---

## 4. Workflows & Interactions

### A. RAG Ingestion Workflow (Knowledge Base Setup)
1. User uploads a document (e.g., Brand Guidelines PDF).
2. The CMS extracts text and chunks it using a `RecursiveCharacterTextSplitter`.
3. Chunks are passed through an Embedding Model (e.g., `text-embedding-3-small`).
4. Vectors and metadata are stored in MongoDB Atlas Vector Search.

### B. Agentic Execution Workflow (User interaction)
1. User sends a prompt: *"Create an Insta post for my new video and schedule it for Friday at 5 PM."*
2. **Context Retrieval:** Agent triggers the RAG Tool to pull relevant user contexts/brand tone.
3. **Reasoning:** Agent processes the prompt + context and decides it needs to:
    *   Generate a caption.
    *   Call the `ScheduleContentTool`.
4. **Tool Execution:** Agent invokes `ScheduleContentTool(platform: 'instagram', date: 'Friday 5PM', caption: '...')`.
5. **Execution Layer:** The tool translates this into a standard CMS database operation and queues a RabbitMQ job for the actual posting time.
6. **Response:** Agent returns context to the user: *"I have drafted your Instagram post and scheduled it for Friday at 5:00 PM."*

---

## 5. Stateful Memory Implementation

Stateful memory is critical for the AI to "remember" the conversation. 
We will use **MongoDB** to persist memory threads.
*   **Thread ID:** Generated for every unique conversation session.
*   **Message History:** When a user sends a prompt, we retrieve the last N messages from the DB belonging to that Thread ID and pass them to the LLM. 
*   This ensures the agent can answer follow-up questions like *"actually, change the time to 6 PM."*

## Open Questions

> [!IMPORTANT]
> 1. Do you prefer using **OpenAI**, **Anthropic**, or another LLM provider for the reasoning engine?
> 2. For the Vector DB, since you use Mongoose, would you like to use **MongoDB Atlas Vector Search**, or do you prefer a dedicated service like Pinecone?
> 3. Should the AI generation happen **synchronously** (user waits for response via HTTP) or **asynchronously** (user gets an immediate 200 OK, and the result is streamed back via WebSockets/Socket.io)?

## Verification Plan

Once approved, we will begin by:
1. Installing foundational dependencies (e.g., `@langchain/core`, `openai` or `@anthropic-ai/sdk`, `mongoose`).
2. Setting up the base structural folders (`src/modules/ai`).
3. Configuring a basic ping-pong agent to test memory retention.
