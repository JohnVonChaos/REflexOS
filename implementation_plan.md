# Implement Streaming Mind Layers

The goal is to modify the chat system so that intermediate cognitive stages (like the subconscious reflection or conscious planner) stream onto the screen one after another, stacking and collapsing when finished. Each layer will also support an "Interrupt" button that halts generation for just that layer, instantly moving to the next.

## Refactoring Plan

### 1. Types Update
We'll update [types.ts](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/types.ts) to support tracking the streaming state of individual memory atoms.
- **[MODIFY]** [types.ts](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/types.ts)
  - Add `isGenerating?: boolean;` to the [MemoryAtom](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/types.ts#21-92) interface.

### 2. UI Updates (Trace Viewer & Message)
We need to refactor [CognitiveTraceViewer](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/CognitiveTraceViewer.tsx#25-168) to display each thought layer as an independent block that automatically expands while generating, collapses when finished, and expands again on mouse hover.
- **[MODIFY]** [components/CognitiveTraceViewer.tsx](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/CognitiveTraceViewer.tsx)
  - Create a new `TraceLayer` component internally that tracks `isHovered` and auto-expands based on `atom.isGenerating || isHovered`.
  - Add an "Interrupt Layer" button when `.isGenerating` is true.
  - Render the list of traces as a vertical stack without a global "Show/Hide Internals" master switch (or keep the master switch but ensure layers display correctly inside).
- **[MODIFY]** [components/Message.tsx](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/Message.tsx)
  - Accept `onInterruptLayer?: () => void` prop.
  - Pass it down to [CognitiveTraceViewer](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/CognitiveTraceViewer.tsx#25-168).
- **[MODIFY]** [components/ChatPanel.tsx](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/ChatPanel.tsx)
  - Accept `onInterruptLayer: () => void` prop.
  - Pass it down to the [Message](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/Message.tsx#117-335) components.

### 3. Core Chat Engine Updates ([useChat.ts](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/hooks/useChat.ts))
The [useChat](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/hooks/useChat.ts#61-1445) hook currently only streams the `synthesis_default` stage. We need to refactor it to stream *all* eligible stages, build the trace incrementally, and handle layer interruptions.
- **[MODIFY]** [hooks/useChat.ts](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/hooks/useChat.ts)
  - Add `interruptLayerRef = useRef(false)` and `const interruptCurrentLayer = useCallback(...)`.
  - In [sendMessage](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/services/geminiService.ts#252-285), instantiate `finalModelAtom` *before* the loop over workflow stages begins, initially with an empty [text](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/Message.tsx#15-62) string and empty `cognitiveTrace`.
  - Change the `workflow.forEach` loop: for all standard stages (except maybe axiom generation which stays hidden), use [sendMessageToGemini](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/services/geminiService.ts#252-285) for streaming.
  - As chunks arrive, update the specific layer in `finalModelAtom.cognitiveTrace` and call `setMessages`.
  - Implement `if (interruptLayerRef.current) break;` inside the chunk loop. This allows aborting just the current stage stream, taking whatever text was generated so far as the output.
  - Finally, add `interruptCurrentLayer` to the returned hook fields.

### 4. Integration ([App.tsx](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/App.tsx))
- **[MODIFY]** [App.tsx](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/App.tsx)
  - Make sure `interruptCurrentLayer` from [useChat](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/hooks/useChat.ts#61-1445) is passed into [ChatPanel](file:///c:/Users/johnv/Downloads/copy-of-reflexengine-otto-matic%20%2823%29/components/ChatPanel.tsx#566-812) as `onInterruptLayer={interruptCurrentLayer}`.

## Verification Plan
### Automated Tests
This project relies mainly on manual verification, but we will ensure typescript compilation passes.

### Manual Verification
1. Open the Chat Interface.
2. Ensure the active workflow includes intermediate stages (e.g., Subconscious, Conscious Planner).
3. Send a message to the AI.
4. **Verify Streaming**: The top-most active stage should immediately appear below the user message, showing a "Processing..." indicator, with text streaming in.
5. **Verify Collapse/Stack**: When that stage finishes, it should collapse to a single headerline, and the next stage should appear below it and start streaming.
6. **Verify Hover Expansion**: Hover the mouse over a collapsed layer; it should instantly expand to show the text, and collapse upon mouse departure.
7. **Verify Layer Interruption**: While a layer is streaming, click its red "Interrupt Layer" button. That layer should instantly stop, collapse, and the *next* layer should immediately begin streaming, using the partial text of the interrupted layer. The overall process should eventually yield a final synthesis response successfully without crashing.
