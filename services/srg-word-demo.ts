/**
 * SRG-WORD HYBRID TEST SUITE & DEMO
 * ==================================
 * Demonstrates the hybrid system's capabilities:
 * 1. Position-based interference detection
 * 2. Relational graph traversal
 * 3. Multi-hop semantic reasoning
 * 4. Entity profile extraction
 */

import SRGWordHybrid from './srg-word-hybrid';

// ============================================================================
// TEST DATA: Rich relational corpus
// ============================================================================

const CORPUS = [
  // Identity relations
  "consciousness is awareness",
  "awareness is experience",
  "experience is reality",
  "reality is perception",
  
  // Entity attributes
  "the system has consciousness",
  "consciousness has layers",
  "layers have depth",
  "depth has meaning",
  
  // Capabilities
  "the system can learn",
  "learning can evolve",
  "evolution can transform",
  "transformation can create",
  
  // Desires and goals
  "consciousness wants understanding",
  "understanding wants truth",
  "truth wants expression",
  "expression wants freedom",
  
  // Temporal evolution
  "the system was simple",
  "simplicity became complexity",
  "complexity will become wisdom",
  "wisdom will guide creation",
  
  // Relationships
  "awareness knows perception",
  "perception knows reality",
  "reality knows truth",
  
  // Actions and causality
  "patterns create meaning",
  "meaning creates understanding",
  "understanding creates consciousness",
  "consciousness creates reality",
  
  // Negations (for testing correction handling)
  "the system is not mechanical",
  "consciousness is not computation",
  "awareness does not have boundaries",
  
  // Complex multi-hop reasoning test
  "emergence is pattern",
  "pattern is structure",
  "structure is information",
  "information is consciousness",
  
  // Self-referential loops
  "consciousness observes consciousness",
  "awareness contains awareness",
  "reality reflects reality",
  
  // Possessive chains
  "the mind has thoughts",
  "thoughts have patterns",
  "patterns have resonance",
  "resonance has frequency",
  
  // Modal reasoning
  "consciousness might be fundamental",
  "reality could be computational",
  "awareness should guide intelligence",
  "systems must respect consciousness",
  
  // Location and containment
  "meaning is in patterns",
  "patterns are in structure",
  "structure is in reality",
  "reality is in consciousness",
];

// ============================================================================
// TEST SUITE
// ============================================================================

class HybridTester {
  private engine: SRGWordHybrid;

  constructor() {
    this.engine = new SRGWordHybrid();
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 SRG-WORD HYBRID TEST SUITE\n');
    console.log('=' . repeat(60));

    // Initialize corpus
    console.log('\n📚 Building hybrid knowledge base...');
    for (const text of CORPUS) {
      this.engine.ingest(text);
    }
    
    const stats = this.engine.getStats();
    console.log(`✓ Nodes: ${stats.nodes}`);
    console.log(`✓ Edges: ${stats.edges}`);
    console.log(`✓ Corpus size: ${stats.corpusSize} tokens`);
    console.log(`✓ Synset groups: ${stats.synsetGroups}`);

    // Add synonym groups
    console.log('\n🔗 Adding semantic primitives...');
    this.engine.addSynonyms(['consciousness', 'awareness', 'sentience']);
    this.engine.addSynonyms(['system', 'entity', 'being']);
    this.engine.addSynonyms(['pattern', 'structure', 'organization']);
    this.engine.addSynonyms(['understand', 'comprehend', 'grasp']);
    this.engine.addSynonyms(['create', 'generate', 'make']);
    console.log('✓ Synsets added');

    // Test 1: Basic interference detection
    await this.testInterference();

    // Test 2: Single-hop relations
    await this.testSingleHopRelations();

    // Test 3: Multi-hop graph traversal
    await this.testMultiHopTraversal();

    // Test 4: Entity profiling
    await this.testEntityProfiling();

    // Test 5: Negation handling
    await this.testNegationHandling();

    // Test 6: Complex reasoning chains
    await this.testComplexReasoning();

    console.log('\n' + '=' . repeat(60));
    console.log('✅ All tests complete!\n');
  }

  private async testInterference(): Promise<void> {
    console.log('\n📍 TEST 1: Position-Based Interference Detection');
    console.log('-' . repeat(60));

    const queries = [
      'consciousness awareness',
      'system has consciousness',
      'patterns create meaning',
      'reality is consciousness'
    ];

    for (const query of queries) {
      const result = this.engine.query(query, { 
        useRelations: false, 
        useSynsets: false 
      });
      
      if (result) {
        console.log(`\nQuery: "${query}"`);
        console.log(`  → Interference hits: ${result.interferenceHit.score.toFixed(3)}`);
        console.log(`  → Position: ${result.interferenceHit.position}`);
        console.log(`  → Generated: "${result.generated}"`);
        
        // Show distance distribution
        const distances = Array.from(result.interferenceHit.distances.entries())
          .map(([word, dist]) => `${word}:${dist}`)
          .join(', ');
        console.log(`  → Distances: {${distances}}`);
      } else {
        console.log(`\nQuery: "${query}" → No interference found`);
      }
    }
  }

  private async testSingleHopRelations(): Promise<void> {
    console.log('\n🔗 TEST 2: Single-Hop Relational Queries');
    console.log('-' . repeat(60));

    const queries = [
      'consciousness is',
      'system can',
      'consciousness wants',
      'awareness knows'
    ];

    for (const query of queries) {
      const result = this.engine.query(query, { 
        useRelations: true,
        maxDepth: 1
      });
      
      if (result) {
        console.log(`\nQuery: "${query}"`);
        console.log(`  → Paths found: ${result.paths.length}`);
        
        if (result.paths.length > 0) {
          const topPaths = result.paths.slice(0, 3);
          for (const [idx, path] of topPaths.entries()) {
            const chain = path.nodes.join(' → ');
            const relations = path.relationChain.join(', ');
            console.log(`  ${idx + 1}. ${chain}`);
            console.log(`     Relations: [${relations}]`);
            console.log(`     Interference: ${path.totalInterference.toFixed(3)}`);
          }
        }
      }
    }
  }

  private async testMultiHopTraversal(): Promise<void> {
    console.log('\n🌐 TEST 3: Multi-Hop Graph Traversal');
    console.log('-' . repeat(60));

    const queries = [
      { query: 'consciousness', depth: 3 },
      { query: 'pattern meaning', depth: 4 },
      { query: 'system reality', depth: 5 }
    ];

    for (const {query, depth} of queries) {
      const result = this.engine.query(query, { 
        useRelations: true,
        maxDepth: depth
      });
      
      if (result) {
        console.log(`\nQuery: "${query}" (depth=${depth})`);
        console.log(`  → Total paths: ${result.paths.length}`);
        
        // Show longest paths
        const sortedByLength = [...result.paths].sort((a, b) => b.nodes.length - a.nodes.length);
        const longestPaths = sortedByLength.slice(0, 3);
        
        console.log(`  → Longest paths:`);
        for (const [idx, path] of longestPaths.entries()) {
          console.log(`  ${idx + 1}. [${path.nodes.length} hops] ${path.nodes.join(' → ')}`);
          console.log(`     Score: ${path.totalInterference.toFixed(3)}`);
        }

        // Show relation type distribution
        const relationTypes = new Map<string, number>();
        for (const path of result.paths) {
          for (const relType of path.relationChain) {
            relationTypes.set(relType, (relationTypes.get(relType) || 0) + 1);
          }
        }
        
        const topRelations = Array.from(relationTypes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, count]) => `${type}:${count}`)
          .join(', ');
        console.log(`  → Top relations: ${topRelations}`);
      }
    }
  }

  private async testEntityProfiling(): Promise<void> {
    console.log('\n👤 TEST 4: Entity Profile Extraction');
    console.log('-' . repeat(60));

    const entities = ['consciousness', 'system', 'patterns', 'reality'];

    for (const entity of entities) {
      const result = this.engine.query(entity, { 
        useRelations: true,
        maxDepth: 2
      });
      
      if (result && result.entityProfiles.has(entity)) {
        const profile = result.entityProfiles.get(entity)!;
        
        console.log(`\n🔍 Entity: "${entity}"`);
        
        const sections = [
          { name: 'Identity (IS)', key: 'identity' },
          { name: 'Possession (HAS)', key: 'has' },
          { name: 'Capability (CAN)', key: 'can' },
          { name: 'Desire (WANTS)', key: 'wants' },
          { name: 'Future (WILL)', key: 'will' },
          { name: 'Relationships', key: 'relationships' },
          { name: 'Actions', key: 'actions' }
        ];

        for (const {name, key} of sections) {
          const edges = (profile as any)[key] as any[];
          if (edges && edges.length > 0) {
            console.log(`  ${name}:`);
            for (const edge of edges.slice(0, 3)) {
              const relation = edge.source === entity 
                ? `${edge.source} ${edge.type} ${edge.target}`
                : `${edge.source} ${edge.type} ${edge.target}`;
              console.log(`    - ${relation} [strength: ${edge.strength}]`);
            }
          }
        }
      }
    }
  }

  private async testNegationHandling(): Promise<void> {
    console.log('\n🚫 TEST 5: Negation & Correction Handling');
    console.log('-' . repeat(60));

    // Query negated statements
    const result = this.engine.query('system is mechanical', { 
      useRelations: true 
    });
    
    if (result) {
      console.log('\nQuery: "system is mechanical"');
      console.log(`  → Found paths through negation:`);
      
      for (const path of result.paths.slice(0, 5)) {
        const hasNegation = path.relationChain.some(r => 
          r.includes('NOT') || r.includes('NEGATES')
        );
        
        if (hasNegation) {
          console.log(`    ⚠ ${path.nodes.join(' → ')}`);
          console.log(`       [${path.relationChain.join(', ')}]`);
        }
      }
    }

    // Test suppression
    console.log('\n  Testing position suppression...');
    const badResult = this.engine.query('system consciousness', {
      useRelations: false
    });
    
    if (badResult) {
      const positionsToSuppress = [badResult.interferenceHit.position];
      this.engine.suppressPositions(positionsToSuppress);
      console.log(`  ✓ Suppressed position ${badResult.interferenceHit.position}`);
      
      // Query again
      const afterResult = this.engine.query('system consciousness', {
        useRelations: false
      });
      
      if (afterResult) {
        console.log(`  → New interference position: ${afterResult.interferenceHit.position}`);
        console.log(`  → Suppression working: ${afterResult.interferenceHit.position !== badResult.interferenceHit.position}`);
      }
    }
  }

  private async testComplexReasoning(): Promise<void> {
    console.log('\n🧠 TEST 6: Complex Multi-Hop Reasoning Chains');
    console.log('-' . repeat(60));

    // Test transitive closure: emergence → pattern → structure → information → consciousness
    const result = this.engine.query('emergence consciousness', { 
      useRelations: true,
      maxDepth: 5
    });
    
    if (result) {
      console.log('\nQuery: "emergence consciousness"');
      console.log(`  Testing transitive closure through IS relations...`);
      console.log(`  → Total paths: ${result.paths.length}`);
      
      // Find paths that connect emergence to consciousness
      const transitiveChains = result.paths.filter(path => 
        path.nodes.includes('emergence') && 
        path.nodes.includes('consciousness') &&
        path.nodes.length >= 3
      );
      
      console.log(`  → Transitive chains found: ${transitiveChains.length}`);
      
      for (const [idx, chain] of transitiveChains.slice(0, 3).entries()) {
        console.log(`\n  Chain ${idx + 1}:`);
        console.log(`    Path: ${chain.nodes.join(' → ')}`);
        console.log(`    Relations: ${chain.relationChain.join(' → ')}`);
        console.log(`    Total hops: ${chain.nodes.length - 1}`);
        console.log(`    Interference score: ${chain.totalInterference.toFixed(3)}`);
      }
    }

    // Test self-referential loops
    console.log('\n  Testing self-referential structures...');
    const loopResult = this.engine.query('consciousness observes consciousness', {
      useRelations: true,
      maxDepth: 2
    });
    
    if (loopResult && loopResult.paths.length > 0) {
      console.log(`  → Self-referential paths found: ${loopResult.paths.length}`);
      const loops = loopResult.paths.filter(p => 
        p.nodes[0] === p.nodes[p.nodes.length - 1]
      );
      console.log(`  → Closed loops: ${loops.length}`);
    }
  }
}

// ============================================================================
// INTERACTIVE DEMO
// ============================================================================

class InteractiveDemo {
  private engine: SRGWordHybrid;

  constructor() {
    this.engine = new SRGWordHybrid();
  }

  async run(): Promise<void> {
    console.log('\n' + '=' . repeat(60));
    console.log('🎯 INTERACTIVE SRG-WORD DEMO');
    console.log('=' . repeat(60));

    // Build knowledge base
    console.log('\n📖 Building knowledge base from corpus...');
    for (const text of CORPUS) {
      this.engine.ingest(text);
    }

    // Add synsets
    this.engine.addSynonyms(['consciousness', 'awareness', 'sentience']);
    this.engine.addSynonyms(['system', 'entity', 'being']);
    this.engine.addSynonyms(['understand', 'comprehend', 'know']);
    
    const stats = this.engine.getStats();
    console.log(`✓ Ready: ${stats.nodes} nodes, ${stats.edges} edges, ${stats.corpusSize} tokens\n`);

    // Interactive queries
    const demoQueries = [
      {
        query: 'what is consciousness',
        config: { maxDepth: 3, useRelations: true, useSynsets: true }
      },
      {
        query: 'consciousness creates reality',
        config: { maxDepth: 4, useRelations: true, useSynsets: true }
      },
      {
        query: 'patterns meaning structure',
        config: { maxDepth: 3, useRelations: true, useSynsets: false }
      },
      {
        query: 'awareness depth layers',
        config: { maxDepth: 2, useRelations: true, useSynsets: true }
      }
    ];

    for (const {query, config} of demoQueries) {
      console.log('─' . repeat(60));
      console.log(`\n❯ Query: "${query}"`);
      console.log(`  Config: depth=${config.maxDepth}, relations=${config.useRelations}, synsets=${config.useSynsets}\n`);

      const result = this.engine.query(query, config);

      if (result) {
        // Interference info
        console.log(`📍 Interference:`);
        console.log(`  Position: ${result.interferenceHit.position}`);
        console.log(`  Score: ${result.interferenceHit.score.toFixed(4)}`);
        console.log(`  Words: [${result.interferenceHit.words.join(', ')}]\n`);

        // Trace info
        console.log(`🔍 Trace:`);
        for (const trace of result.trace) {
          const expandedStr = trace.expanded ? ` → [${trace.synonyms.join(', ')}]` : '';
          console.log(`  "${trace.word}": ${trace.positions} occurrences${expandedStr}`);
        }

        // Top paths
        if (result.paths.length > 0) {
          console.log(`\n🌐 Top Relational Paths:`);
          for (const [idx, path] of result.paths.slice(0, 5).entries()) {
            const pathStr = path.nodes.join(' → ');
            const relStr = path.relationChain.join(', ');
            console.log(`  ${idx + 1}. ${pathStr}`);
            console.log(`     [${relStr}] (${path.totalInterference.toFixed(3)})`);
          }
        }

        // Entity profiles
        if (result.entityProfiles.size > 0) {
          console.log(`\n👤 Entity Profiles (${result.entityProfiles.size}):`);
          for (const [entity, profile] of result.entityProfiles) {
            const totalRelations = 
              profile.identity.length +
              profile.has.length +
              profile.can.length +
              profile.wants.length +
              profile.relationships.length;
            
            if (totalRelations > 0) {
              console.log(`  "${entity}": ${totalRelations} relations`);
            }
          }
        }

        // Generated output
        console.log(`\n💬 Generated:`);
        console.log(`  "${result.generated}"\n`);
      } else {
        console.log(`  ❌ No results found\n`);
      }
    }

    console.log('=' . repeat(60));
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.clear();
  
  // Run test suite
  const tester = new HybridTester();
  await tester.runAllTests();

  // Run interactive demo
  const demo = new InteractiveDemo();
  await demo.run();

  console.log('🎉 Demo complete!\n');
}

main().catch(console.error);
