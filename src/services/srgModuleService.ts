import { get, set, del, keys } from 'idb-keyval';
import type {
  SRGModule,
  ModuleImportConfig,
  ModuleQueryResult,
  InterferencePattern,
  Pulse,
  ModuleStorageEntry,
  WorkflowStage,
  StageModuleConfig
} from '../types';
import { srgService } from './srgService';
import { analyzeInterference, calculateHash } from './interferenceAnalyzer';
import { memoryService } from './memoryService';

const MODULE_STORE_PREFIX = 'srg-module-';

class SRGModuleService {
  private modules: Map<string, SRGModule> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const moduleKeys = await keys();
      const moduleStorageKeys = moduleKeys.filter(k => typeof k === 'string' && k.startsWith(MODULE_STORE_PREFIX));
      for (const key of moduleStorageKeys) {
        try {
          const stored = await get(key as string) as ModuleStorageEntry | undefined;
          if (stored && stored.module) {
            const parsed = JSON.parse(stored.serializedGraph);
            const module: SRGModule = {
              ...stored.module,
              graph: {
                nodes: new Map(Object.entries(parsed.nodes)),
                links: parsed.links,
                metadata: parsed.metadata
              }
            };
            this.modules.set(module.id, module);
          }
        } catch (err) {
          console.error(`Failed to load module ${key}:`, err);
        }
      }
      this.initialized = true;
      console.log(`SRGModuleService initialized with ${this.modules.size} modules`);
    } catch (error) {
      console.error('Failed to initialize SRGModuleService:', error);
      this.initialized = true;
    }
  }

  private tokenizeText(text: string): string[] {
    return text.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean).slice(0, 200);
  }

  async importModule(entries: { source?: string; role?: string; text: string; timestamp?: number }[], config: ModuleImportConfig): Promise<SRGModule> {
    await this.init();
    const moduleGraph = {
      nodes: new Map<string, any>(),
      links: [] as any[],
      metadata: { totalNodes: 0, totalLinks: 0, averageDegree: 0 }
    };

    for (const entry of entries) {
      const words = this.tokenizeText(entry.text);
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (!moduleGraph.nodes.has(w)) {
          moduleGraph.nodes.set(w, { id: w, word: w, layer: w.length, createdAt: Date.now() });
        }
        if (i > 0) {
          moduleGraph.links.push({ source: words[i - 1], target: w, type: 'syntactic', createdAt: Date.now(), accessedAt: [Date.now()], strength: 1 });
        }
      }
    }

    moduleGraph.metadata.totalNodes = moduleGraph.nodes.size;
    moduleGraph.metadata.totalLinks = moduleGraph.links.length;

    const module: SRGModule = {
      id: this.generateId(),
      name: config.name,
      description: config.description,
      graph: moduleGraph,
      weight: config.weight ?? 1.0,
      isActive: true,
      metadata: {
        source: config.source || 'manual',
        version: '1.0.0',
        entryCount: entries.length,
        topics: config.topics || [],
        expertise: config.expertise || 'general',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      blockchainProof: {
        trainingHash: await calculateHash(JSON.stringify(entries)),
        graphSignature: await calculateHash(JSON.stringify({ nodes: Array.from(moduleGraph.nodes.entries()), links: moduleGraph.links })),
        timestamp: Date.now()
      }
    };

    this.modules.set(module.id, module);
    await this.saveModule(module);
    console.log(`Module imported: ${module.name} (${module.id})`);
    try {
      await memoryService.createAtom({ role: 'model', type: 'steward_note', text: `Module imported: ${module.name} (${module.id})`, isInContext: false });
    } catch (e) {
      console.warn('Failed to create memory atom for module import', e);
    }
    return module;
  }

  async queryWithInterference(prompt: string, settings: any): Promise<InterferencePattern> {
    await this.init();
    const activeModules = Array.from(this.modules.values()).filter(m => m.isActive);
    if (activeModules.length === 0) {
      // fallback to main SRG
      const trace = srgService.trace(prompt, settings.traversal || settings);
      const allResults: any[] = [];
      for (const pulses of trace.values()) allResults.push(...pulses);
      const aggregated = (allResults.map(p => ({ nodeId: p.nodeId, activation: 1, depth: p.level })) as Pulse[]).slice(0, 200);
      return {
        modules: [],
        pairwiseInterference: [],
        agreements: [],
        conflicts: [],
        consensus: { reached: true, dominantModule: null, confidenceScore: 1.0, averageSimilarity: 1.0 },
        aggregatedPulses: aggregated,
        patternHash: await calculateHash(JSON.stringify(aggregated))
      };
    }

    const results: ModuleQueryResult[] = await Promise.all(activeModules.map(async (module) => {
      // Simple per-module query: score words by presence in module graph
      const words = prompt.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean);
      const pulses: Pulse[] = [];
      for (const w of words) {
        if (module.graph.nodes.has(w)) {
          pulses.push({ nodeId: w, activation: 1, depth: 0 });
        }
      }
      // expand with neighbors from module
      for (const [nid, node] of module.graph.nodes.entries()) {
        if (pulses.length > 100) break;
        if (words.includes(nid)) continue;
        // tiny heuristic: if node appears in prompt as substring, boost
        const activation = words.some(w => nid.includes(w)) ? 0.5 : 0.01;
        if (activation > 0.02) pulses.push({ nodeId: nid, activation, depth: 1 });
      }

      const topNodes = pulses.sort((a, b) => b.activation - a.activation).slice(0, 10).map(p => p.nodeId);
      const totalActivation = pulses.reduce((s, p) => s + p.activation, 0);
      return {
        moduleId: module.id,
        moduleName: module.name,
        weight: module.weight,
        pulses,
        topNodes,
        totalActivation,
        responseHash: await calculateHash(JSON.stringify(pulses))
      };
    }));

    const interference = await analyzeInterference(results, activeModules);
    return interference;
  }

  listModules(): SRGModule[] { return Array.from(this.modules.values()); }

  getModule(id: string): SRGModule | undefined { return this.modules.get(id); }

  async updateModuleWeight(id: string, weight: number): Promise<void> {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Module ${id} not found`);
    module.weight = Math.max(0, Math.min(1, weight));
    module.metadata.updatedAt = Date.now();
    await this.saveModule(module);
  }

  async toggleModule(id: string): Promise<void> {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Module ${id} not found`);
    module.isActive = !module.isActive;
    module.metadata.updatedAt = Date.now();
    await this.saveModule(module);
    try {
      await memoryService.createAtom({ role: 'model', type: 'steward_note', text: `Module ${module.isActive ? 'enabled' : 'disabled'}: ${module.name} (${module.id})`, isInContext: false });
    } catch (e) {
      console.warn('Failed to create memory atom for module toggle', e);
    }
  }

  /** Return active modules and their weights (optionally filtered by stage policy) */
  getActiveModulesWithWeights(stageId?: string): { id: string; weight: number }[] {
    return Array.from(this.modules.values()).filter(m => m.isActive).map(m => ({ id: m.id, weight: m.weight }));
  }

  /**
   * Return active modules for a given workflow stage according to stage.modules policy.
   * If the stage has no modules configured, treat as all installed modules enabled with weight 1.0
   */
  getActiveModulesForStage(workflow: WorkflowStage[], stageId: string): { id: string; weight: number }[] {
    const stage = workflow.find(s => s.id === stageId);
    if (!stage) return [];

    const installed = Array.from(this.modules.values()).map(m => ({ id: m.id, weight: m.weight }));

    if (!stage.modules || stage.modules.length === 0) {
      // default: all installed modules enabled at weight 1.0
      return installed.map(m => ({ id: m.id, weight: 1.0 }));
    }

    // Build mapping for installed modules to ensure we only return modules that are installed
    const installedIds = new Set(installed.map(i => i.id));

    return stage.modules
      .filter((cfg: StageModuleConfig) => cfg.enabled && installedIds.has(cfg.id))
      .map((cfg: StageModuleConfig) => ({ id: cfg.id, weight: cfg.weight }));
  }

  async deleteModule(id: string): Promise<void> {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Module ${id} not found`);
    this.modules.delete(id);
    await del(`${MODULE_STORE_PREFIX}${id}`);
    console.log(`Module deleted: ${module.name} (${id})`);
    try {
      await memoryService.createAtom({ role: 'model', type: 'steward_note', text: `Module deleted: ${module.name} (${id})`, isInContext: false });
    } catch (e) {
      console.warn('Failed to create memory atom for module deletion', e);
    }
  }

  private async saveModule(module: SRGModule): Promise<void> {
    // Normalize nodes for serialization: support Map, object, or array shapes
    let nodesForSerialization: any;
    if (module.graph && module.graph.nodes) {
      const nodes = module.graph.nodes as any;
      if (nodes instanceof Map) {
        nodesForSerialization = Array.from(nodes.entries());
      } else if (Array.isArray(nodes)) {
        nodesForSerialization = nodes;
      } else if (typeof nodes === 'object') {
        nodesForSerialization = Object.entries(nodes);
      } else {
        nodesForSerialization = [];
      }
    } else {
      nodesForSerialization = [];
    }

    const serialized = {
      module: { ...module, graph: undefined },
      serializedGraph: JSON.stringify({ nodes: nodesForSerialization, links: module.graph?.links || [], metadata: module.graph?.metadata || {} }),
      timestamp: Date.now()
    };
    await set(`${MODULE_STORE_PREFIX}${module.id}`, serialized);
  }

  private generateId(): string { return `module-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; }

  async exportModule(id: string): Promise<string> {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Module ${id} not found`);
    return JSON.stringify(module, null, 2);
  }

  async importFromJSON(json: string): Promise<SRGModule> {
    const data = JSON.parse(json);
    const module: SRGModule = { ...data, id: this.generateId(), metadata: { ...data.metadata, createdAt: Date.now(), updatedAt: Date.now() } };
    this.modules.set(module.id, module);
    await this.saveModule(module);
    return module;
  }
}

export const srgModuleService = new SRGModuleService();
