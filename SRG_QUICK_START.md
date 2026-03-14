# SRG Explorer Quick Start Guide

## 🚀 Quick Start

### 1. Open SRG Explorer
Click the "SRG" button in the main interface or press the keyboard shortcut.

### 2. Run a Query
```
Type: "consciousness"
Click: ▶ Play button (or press Enter)
Result: Top 200 nodes appear, organized by relevance
```

### 3. Explore the Graph
- **Pan**: Click and drag background
- **Zoom**: Scroll wheel
- **Hover**: See node details
- **Expand**: Click "+100" to show more nodes

---

## 🎨 Visual Legend

### Edge Colors
- **Blue** 🔵 - Identity (IS, IS_A)
- **Orange** 🟠 - Causation (CREATES, MAKES, CAUSES)
- **Pink** 🩷 - Desire (WANTS, LOVES, NEEDS)
- **Cyan** 🔷 - Capability (CAN, ABLE_TO)
- **Green** 🟢 - Possession (HAS, OWNS)
- **Purple** 🟣 - Temporal (WAS, WILL)
- **Gray** ⚫ - Syntactic (word order)

### Edge Styles
- **Solid** ─── - Definite relations
- **Dashed** ╌╌╌ - Possibility (CAN, MIGHT, MAY)
- **Pulsing** ⚡ - Causation (CREATES, CAUSES)

---

## ⚙️ Configuration Panel

### Traversal Logic
- **Strategy**: How to explore the graph
  - BFS = Breadth-first (layered)
  - DFS = Depth-first (deep dive)
  - Weighted = By edge strength
  - Random Walk = Probabilistic
  - Attention = Hub-focused

- **Max Depth**: How far to traverse (1-5)
- **Branch Factor**: How many paths per node (1-20)

### Display Physics
- **Node Repulsion**: How far nodes push apart (5-200)
- **Link Distance**: Base edge length (20-300)
- **Color by Layer**: Rainbow by word length

### Edge Filtering
- **Show Syntactic Edges**: Toggle gray word-order edges
- **Show Only Top Paths**: Toggle to show all edges
- **Min Strength**: Filter weak edges (1-20)
- **Min Interference**: Filter low-correlation edges (0-1)
- **Max Visible Edges**: Cap total edges shown (50-1000)

---

## 📊 Stats Display

```
Showing 200 / 5,427 nodes | 450 edges
         ↑       ↑           ↑
    visible   total     filtered
```

- **Visible**: Currently rendered
- **Total**: Available in graph
- **Edges**: After filtering

---

## 🔍 Common Queries

### Philosophical
```
"consciousness"  → Identity, capability, relations
"reality"        → Creation, perception, truth
"meaning"        → Understanding, purpose, significance
```

### Relational
```
"system creates" → Find causation chains
"mind knows"     → Explore knowledge relations
"life wants"     → Discover desire patterns
```

### Expansive
```
"purpose"        → 721k tokens, 5,427 nodes (STRESS TEST)
"being"          → Ontological exploration
"truth"          → Epistemological paths
```

---

## ⚡ Performance Tips

### Slow Performance?
1. **Reduce nodes**: Lower "Max Visible Edges" to 200
2. **Filter edges**: Increase "Min Strength" to 5
3. **Hide syntactic**: Toggle off "Show Syntactic Edges"
4. **Top paths only**: Enable "Show Only Top Paths"

### Too Sparse?
1. **Expand nodes**: Click "+100" button
2. **Show more edges**: Increase "Max Visible Edges" to 1000
3. **Lower thresholds**: Reduce "Min Strength" to 1
4. **Show all**: Disable "Show Only Top Paths"

### Can't Find Node?
1. **Expand**: Click "+100" repeatedly
2. **Lower activation**: Reduce minimum activation threshold
3. **Different query**: Try synonym or related word

---

## 🐛 Troubleshooting

### Graph is Frozen
✅ **This is normal!** Auto-freeze saves CPU.
- Drag any node to unfreeze it
- Pan/zoom works on frozen graphs

### No Nodes Appear
1. Check query spelling
2. Try simpler word (e.g., "system" not "systemization")
3. Verify corpus has content (see token count in header)

### Edges Missing
1. Enable "Show Syntactic Edges"
2. Disable "Show Only Top Paths"
3. Lower "Min Strength" to 1
4. Lower "Min Interference" to 0.0

### Performance Issues
1. Reduce "Max Visible Edges" to 200
2. Enable "Show Only Top Paths"
3. Increase "Min Strength" to 5
4. Close other browser tabs

---

## 📚 Load a Book

1. Click **"Load Book"** button in header
2. Select `.txt`, `.md`, or `.json` file
3. Enter title (e.g., "Meditations")
4. Choose category:
   - 1 = Literature
   - 2 = Technical
   - 3 = Philosophy
   - 4 = Psychology
   - 5 = History
   - 6 = Manual
   - 7 = Other
5. Wait for ingestion (shows word count)
6. Query the new knowledge!

---

## 🎯 Use Cases

### 1. Concept Exploration
```
Query: "consciousness"
Goal: Understand relations between mind, awareness, reality
Actions: Follow blue (IS) and orange (CREATES) edges
```

### 2. Causal Chain Discovery
```
Query: "system creates reality"
Goal: Find multi-hop causation paths
Actions: Enable "Show Only Top Paths", follow orange edges
```

### 3. Semantic Clustering
```
Query: "truth"
Goal: Find related concepts (knowledge, reality, belief)
Actions: Expand to 500+ nodes, look for dense regions
```

### 4. Knowledge Archaeology
```
Query: Common word like "know"
Goal: Explore what the corpus knows about knowing
Actions: Follow purple (KNOWS) edges, check entity profiles
```

---

## ⌨️ Keyboard Shortcuts

- **Enter**: Run trace query
- **Escape**: Close SRG Explorer
- **+/=**: Zoom in
- **-**: Zoom out
- **0**: Reset view
- **Space**: Toggle config panel (future)

---

## 🔬 Advanced: Entity Profiles

Hover over a node to see:
```
word: "consciousness"
Layer: 13 (word length)
Primitive: N/A (or "being", "system", etc.)
Part of Active Causal Trace: Yes/No
```

Future: Click node for full entity profile:
- identity: IS/IS_A relations
- has: Possession relations
- can: Capability relations
- wants: Desire relations
- actions: CREATES/MAKES/etc.

---

## 📈 Performance Targets

| Scenario | Target | Typical |
|----------|--------|---------|
| Small query (< 100 nodes) | < 1s | 0.5s |
| Medium query (100-500 nodes) | < 2s | 1.5s |
| Large query (500+ nodes) | < 3s | 2.5s |
| Massive query (5000+ nodes) | < 5s | 3-4s |
| Frame rate (frozen) | 60 FPS | 60 FPS |
| Frame rate (physics) | 30 FPS | 30-45 FPS |

---

## 🎓 Learning Path

### Beginner
1. Try simple queries: "system", "reality", "mind"
2. Hover nodes to see relations
3. Use default settings

### Intermediate
1. Adjust "Max Depth" and "Branch Factor"
2. Toggle edge filtering options
3. Load a small book (< 50 pages)

### Advanced
1. Write custom traversal scripts
2. Load large corpora (books, papers)
3. Combine multiple knowledge sources
4. Analyze entity profiles

---

## 🚨 Important Notes

1. **Auto-Freeze is Your Friend**: Graph stops moving after 2-4 seconds to save CPU. This is intentional!

2. **Edge Filtering is Aggressive**: By default, only HIGH-priority relations show. This is to prevent visual overload.

3. **Activation Ranking**: Nodes closer to your query appear first. This ensures relevance.

4. **Top Paths Only**: By default, only edges in top 3 paths show. This highlights semantic connections.

5. **Progressive Disclosure**: Start with 200 nodes, expand as needed. Don't try to show everything at once.

---

## 🤝 Support

- **Documentation**: `services/IMPLEMENTATION_GUIDE.md`
- **Architecture**: `services/ARCHITECTURE.txt`
- **Tests**: `tests/srgExplorerEnhancements.test.ts`

---

## 🎉 Have Fun!

The SRG Explorer is a semantic space telescope. Point it at concepts, watch patterns emerge, discover hidden relations. 

**Pro Tip**: Try query "being IS reality" to see multi-word relational queries in action!
