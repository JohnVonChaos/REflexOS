# Chat Import & Workspace System - Quick Start

This guide explains how to use the new conversation import system and workspace management features in Reflex Engine.

## Importing Conversations

### What Can You Import?

You can import conversation logs from:
- **ChatGPT**: Export format (JSON array with `mapping` structure)
- **Claude**: Conversation exports (JSON)
- **Generic chat logs**: Line-delimited JSON or plain text

### How to Import

1. Click **"Import Chats"** button in the Sidebar (left panel)
2. Select a `.json` or `.txt` file containing conversation data
3. The system will:
   - Parse the conversation format automatically
   - Create memory atoms for each turn (user/assistant)
   - Ingest turns into the SRG corpus with speaker attribution
   - Make it immediately available for context selection

### Conversation Data Format

You can use any of these formats:

#### ChatGPT Export (JSON Array)
```json
[
  {
    "id": "conversation-id",
    "mapping": {
      "node-1": {
        "message": {
          "author": { "role": "user" },
          "create_time": 1690000000,
          "content": { "parts": ["What is the capital of France?"] }
        }
      },
      "node-2": {
        "message": {
          "author": { "role": "assistant" },
          "create_time": 1690000001,
          "content": { "parts": ["The capital of France is Paris."] }
        }
      }
    }
  }
]
```

#### Line-Delimited JSON
```json
{ "source": "chatgpt", "conversationId": "conv-1", "role": "user", "timestamp": 1690000000, "text": "What is the capital of France?" }
{ "source": "chatgpt", "conversationId": "conv-1", "role": "assistant", "timestamp": 1690000001, "text": "The capital of France is Paris." }
```

#### Plain Text (Paragraphs separated by blank lines)
```
What is the capital of France?

The capital of France is Paris.

How many people live there?

As of 2023, Paris has approximately 2.1 million residents in the city proper...
```

## Using Imported Conversations in Workflow

Once imported, your conversations appear as **memory atoms** that you can:

1. **Toggle into context** via the Context Manager modal (🔍 icon in ChatPanel)
2. **Enable in workflow stages** by selecting the **"Imported Conversation History"** checkbox in the Workflow Designer
3. **Speed-read & summarize** automatically as knowledge modules (see next section)

### IMPORTED_HISTORY Context Packet

In the **Workflow Designer**, when editing a stage's inputs, check:
- ✓ **Imported Conversation History** to include imported chats in that stage's context

The system will:
- Group turns by source (ChatGPT, Claude, etc.)
- Preserve speaker attribution (👤 User vs 🤖 Assistant)
- Display in chronological order within each conversation

Example output in context:
```
[Source: chatgpt]
  Conversation: conv-1
    👤 User: What is the capital of France?
    🤖 Assistant: The capital of France is Paris.
    👤 User: How many people live there?
    🤖 Assistant: As of 2023, Paris has approximately 2.1 million residents...
```

## Speed-Read & Summarization Pipeline

To extract knowledge from imported conversations as structured modules:

### Automatic Chunking
When you import conversations, they're automatically:
1. **Chunked** into 5-15 turn segments by topic/flow
2. **Speed-read** to extract key topics, questions, and insights
3. **Ingested** as knowledge modules in the SRG with speaker attribution

This happens transparently — no manual steps needed.

### Knowledge Module Contents

Each knowledge module includes:
- **Summary**: One-paragraph overview of the chunk
- **Key Topics**: 3-5 main topics discussed
- **User Questions**: Extracted user queries from the chunk
- **Assistant Insights**: Key answers/insights from the assistant
- **SRG Integration**: All turns indexed in the semantic graph for retrieval

### Example: Importing ChatGPT Logs About Python

If you import a conversation about Python programming:
1. System chunks it (e.g., "Basics", "Error Handling", "Performance")
2. Extracts summaries: "Discussion on Python list comprehensions and performance..."
3. Creates atoms with speaker attribution
4. Makes searchable via the Context Manager's semantic search

---

## Workspace Management

### What Are Workspaces?

Workspaces let you **save and restore** specific configurations:
- Which messages are in context
- Which files are in context
- (Optionally) Workflow settings, AI settings, preferences

### How to Save a Workspace

1. Open **Context Manager** (📎 icon in ChatPanel header)
2. Arrange your context with messages and files you want
3. On the right side, enter a workspace name
4. Click **Save**

The workspace is now stored in your browser's local database.

### How to Load a Workspace

1. Open **Context Manager**
2. On the right side, select a workspace from the dropdown
3. Click **Restore**

All items and files are automatically restored to context.

### Workspace Types

#### Simple Workspace (Default)
- Saves: Message selections + file selections
- Restores: Same context items

#### Full State Workspace
- Saves: Context items + workflow configuration + AI settings + RCB state
- Restores: Everything (including complex setups)

To create a full state workspace, check the appropriate boxes when saving.

---

## Tips & Best Practices

### For Conversation Imports
1. **Export your chats regularly** from ChatGPT/Claude before they're deleted
2. **Use consistent source names** (e.g., always "chatgpt" or "claude") for grouping
3. **Include conversationId** in imports for better organization
4. **Large files** (1000+ turns) are automatically chunked efficiently

### For Workspaces
1. **Save workspace before major changes** — acts as a checkpoint
2. **Name workspaces descriptively** (e.g., "PythonResearch-v2")
3. **Full state workspaces** are great for complex multi-stage workflows
4. **Workspaces persist** in browser storage, survive page reloads

---

## Troubleshooting

### Import fails with "Invalid JSON"
- Ensure file is valid JSON or plain text
- Try line-delimited JSON format if array format fails
- Check for encoding issues (UTF-8 recommended)

### Imported conversations don't appear in context
- Make sure "Imported Conversation History" is checked in workflow stage
- Toggle items into context via Context Manager first
- Verify import completed (check browser console logs)

### Workspace won't load
- Try creating a new workspace with current context
- Check browser storage isn't full (clear old workspaces if needed)
- Reload the page and try again

---

## Integration with SRG

Imported conversations are automatically integrated with the **Semantic Relationship Graph (SRG)**:

1. Each turn is tokenized and indexed by speaker role
2. Summaries are added to the semantic corpus
3. Speed-read insights create knowledge nodes
4. Full-text search finds relevant turns via SRG queries
5. Context Manager's semantic search ranks by relevance

This means imported knowledge is **discoverable, retrievable, and context-aware** — not just stored inertly.

---

For more details, see:
- `docs/IMPORTING_CONVERSATIONS.md` — Technical import format reference
- `services/chatImportService.ts` — Parser implementation
- `services/conversationSummarizerService.ts` — Speed-read pipeline
