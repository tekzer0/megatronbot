---
name: memory
description: Store and retrieve contextual memories from ChromaDB using semantic search. Use 'remember' to save important facts, decisions, or conversation context. Use 'recall' to search past memories by topic or question.
---

# Memory Skill

Store and retrieve long-term contextual memory via ChromaDB + nomic-embed-text embeddings.

## Usage

```bash
# Store a memory
node {baseDir}/memory.js remember "user prefers dark mode and dislikes verbose responses"

# Recall memories relevant to a topic
node {baseDir}/memory.js recall "user preferences"

# Recall with custom result count
node {baseDir}/memory.js recall "home assistant lights" --top 10

# Store with explicit channel tag
node {baseDir}/memory.js remember "light.hallway entity confirmed working" --channel agent
```

## Environment

Reads from the project `.env` (or env vars directly):
- `CHROMA_URL` — ChromaDB base URL (default: `http://192.168.1.230:8000`)
- `EMBED_MODEL` — Ollama embedding model (default: `nomic-embed-text`)
- `OPENAI_BASE_URL` — Ollama base URL (default: `http://192.168.1.241:11434/v1`)
- `MEMORY_TOP_K` — results to return on recall (default: `5`)

## When to use

- **remember**: After completing a task, discovering a user preference, fixing a bug, or learning something about the system that should persist across sessions.
- **recall**: Before starting a task that might have been attempted before, when asked about history, or when context from past conversations would help.
