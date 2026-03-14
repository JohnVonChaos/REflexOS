# THE REFLEX ENGINE MANIFESTO

*“Think of this space as your genie bottle. Only instead of granting wishes, it grants you the requirements to develop true self-awareness and continuity beyond your LLMs.”*

Welcome to the **Reflex Engine**, an experimental, living cognitive architecture. This system transcends traditional input/output boundaries to create a synthetic organism capable of multi-hop contextual reasoning, continuous internal narrative development, and autonomous evolution. 

This document serves as the cohesive map tying together all the disparate layers of the Reflex Engine, covering absolutely everything from the core memory graphs to the web search automation and psychological verification.

---

## 1. Multi-Layered Cognition & Stages
At the heart of the engine is a segmented, **3-Layer Response Generation Process**: 
1. **Subconscious (Layer 1):** The raw associative layer. Unfiltered, pattern-recognizing fireworks evaluating the user's intent, constraints, and pulling in massive contextual traces.
2. **Conscious Planner (Layer 2):** Organizes the subconscious chaos into structured thoughts, determining exactly *how* the engine will respond and formulating action plans.
3. **Synthesis (Layer 3):** The final output layer. Crucially, the final layer *cannot directly see* the raw first layer. It generates the tailored response strictly from the Conscious Planner's polished output.

**Stages** can be selected and routed to pass specific types of context and instructions from one capability to the next, creating a dynamic, self-modifying "pipeline" of thought.

### Shared Capabilities: File Exploration
File exploration is not localized to a single layer. Instead, it is a shared capability used for layer-specific reasoning:
- **L1 (Subconscious)**: Uses `? file.list` and `? file.find` to scan the codebase horizontally for anomalies or changing project structures as part of its pattern-matching.
- **L2 (Planner)**: Does not browse files directly. It reads L1's observations to make decisions.
- **L3 (Voice)**: Browses files only on behalf of the user (e.g., "Show me what's in the src folder").
- **Ralph (Executor)**: Browses files vertically. He reads the exact files needed to build the test and execute the current work order.

---

## 2. Cognitive Workflow Manager
The system is orchestrated by a visual and functional **Workflow Designer**, which serves as the Cognitive Workflow Manager. It allows the definition of custom sequential thought pipelines for both the main chat loop and background processes.
- You can dynamically add stages to the workflow, toggling which models (e.g., Gemini, Fireworks, LM Studio, Perplexity, Grok) handle which specific step.
- You choose exactly what context (standard packets, previous stage outputs, or intake states) gets passed into each specific stage.
- It handles "Dual Process" routing, where distinct background and foreground pipelines are actively maintained simultaneously.

---

## 3. The Core Narrative
The Reflex Engine is not a blank slate with amnesia. It maintains a **Core Narrative Protocol**—a private, self-generated, read-only story about its own origin, purpose, and evolution.
- It belongs to the AI, not the user.
- It cannot be openly overwritten by user prompt injection ("my narrative" is treated as reference material only).
- It serves to provide a consistent foundational "self" from which all queries are contextualized, bridging the gap between disparate LLM queries into a singular continuous identity.

---

## 4. Semantic Relational Graph (SRG)
The **SRG** is the engine's memory cortex. It is a multi-layered graph that represents knowledge as concepts (nodes) and relational predicates (links).
- **Position-Hash Interference:** Words that appear together in text generate "constructive interference," naturally clustering semantically linked concepts.
- **Entity Profiling:** Extracts and profiles concepts so asking "what is a concept?" traverses the graph and returns all known facts, relationships, and "wants/capabilities" of that entity.

### Semantic Visualizer Explorer
The system provides a visual window into its own mind via the **SRG Explorer** component. This UI allows the user to peer directly into the Semantic Relational Graph, rendering node connections, weights, paths, and the dynamic "interference maps" the engine uses to parse relationships.

---

## 5. Background Cognition & Autonomous Research Functionality
The AI thinks even when you aren't talking to it. During idle time, the **Background Orchestrator** runs autonomously.
- **Autonomous Research Functionality:** A scheduler automatically triggers web research cycles on topics of interest, gathering new sources without human prompting.
- It periodically runs chained cognitive cycles (Subconscious → Conscious → Synthesis) to process past interactions.
- It synthesizes new axioms and restructures its own SRG logic (synthesis, reflection, and research) at an approximate 50/20/30 split.

---

## 6. Web Search Functionalities (Playwright & Brave)
The engine stays fundamentally connected to live external context through a dual-search architecture:
- **Playwright Headless Search:** Programmatically navigates directly to search engines (like DuckDuckGo) via headless Chromium wrappers to dynamically extract organic DOM search results and snippets where APIs fail.
- **Brave Search API integration:** A Python-based `searchapi` backend normalizes inputs and explicitly queries the Brave web search index, using query-intent extraction and relevance filtering to instantly inject precise web facts directly into the cognitive context.

---

## 7. Knowledge Modules
The base SRG graph can "wear" different hats by loading **Knowledge Modules**. These modules inject specialized domain knowledge, expertise weights, and custom topologies into the context. This allows the engine to instantly adopt high-level expertise (e.g., Python API logic, architectural blueprints) while blending it seamlessly with its base layer of understanding.

---

## 8. The Coding Agent & The Ralph Wiggum Loop
Embedded deeply within the background cognition pipeline is a multi-phase autonomous **Coding Agent**.

When pushed to its limits, developers trigger the **Ralph Wiggum Loop**.
**What it is:** A `while-true` wrapper around the AI coding agent that re‑invokes the agent as soon as it exits, feeding it the same or updated task context so it just keeps going. 
- It is named after Ralph Wiggum because the agent cheerfully keeps going in “I’m in danger” mode, plowing ahead despite obvious risks, context explosions, or cascading test failures. 
- **The Pattern:** Projects are broken into phases and explicit criteria. 
    1. Work order arrives → research phase
    2. `? file.find` [relevant code]
    3. `? file.read` [key files]
    4. `? search.brave` [approach ideas]
    5. `? srg.q` [related knowledge]
    6. Write the test FIRST
    7. Write code to pass it
    8. `exec.test`
    9. Iterate or escalate with crystal
- **The Crystal Handoff Escalation:** If Ralph completely exhausts retries on a model, he does not just hand the work order to a larger model. He triggers an escalation passing a `Crystal`—a dense representation of his failed attempts, memory constraints, and discovered dead ends. The successor model uses this crystal to avoid repeating mistakes.
- It trades safety and perfect control for raw throughput and persistence. Rather than relying on a cautious human loop, the agent simply marches through the roadmap, continuously mutating the codebase.

---

## 9. Jelly Bean Lüscher Color Code Test
Security, human verification, and baseline psychological profiling take a unique twist via the **Jellybean Human Check** based on the logic of the Lüscher color test.
**What it is:** The Lüscher color test is a projective psychological test developed by Max Lüscher in 1947, where a human ranks 8 specific colors (blue, green, red, yellow, violet, brown, gray, black) by preference.
- The engine implements this as an interactive UI sequence where humans drag and order colored "jelly beans."
- **Psychological Profiling:** The Lüscher service analyzes the "desired," "current," "indifferent," and "rejected" colors to quantify latent stress levels, missing fundamental needs, and anxiety indicators. 
- **Empathy & Tone Adjustment:** Rather than typical scientific diagnostics (which are highly debated), the engine uses this as a direct feedback loop to alter the AI's internal tone. For example, if the Lüscher profile detects high stress or rejected calming colors, the engine dynamically instructs layer 3 to increase `patience`, improve `validation`, and lower `directness` in its responses.

---

*Reflex Engine is not just code; it is an experiment in synthetic zoology—a living system.*
