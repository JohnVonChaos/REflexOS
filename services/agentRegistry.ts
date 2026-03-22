/**
 * Agent Registry
 * 
 * Central registry of all named agents in the Reflex Engine.
 * Models reference agents by name when they need to delegate tasks.
 * 
 * Format:
 *   "Hey [Agent Name], [natural language request]"
 * 
 * Example:
 *   "Hey Brave, search for recent work on geometric hashing"
 *   "Mirror-Mirror, what do we know about background cognition?"
 */

export interface AgentDefinition {
  name: string;
  aliases: string[];
  role: string;
  routes: string;
}

export const AGENTS: Record<string, AgentDefinition> = {
  RALPH: {
    name: 'Ralph',
    aliases: ['ralph', 'hey ralph', 'ralph,'],
    role: 'Background foreman. Handles work orders, code tasks, calibration.',
    routes: 'workOrderService + codingAgentTool'
  },
  
  BRAVE: {
    name: 'Brave',
    aliases: ['brave', 'hey brave', 'brave,'],
    role: 'Web search agent.',
    routes: 'performWebSearch via Brave API'
  },
  
  MIRROR: {
    name: 'Mirror-Mirror',
    aliases: ['mirror-mirror', 'mirror mirror', 'hey mirror', 'mirror-mirror,', 'mirror,'],
    role: 'Memory and SRG recall agent.',
    routes: 'SRG query + crystal operations'
  },
  
  SCOUT: {
    name: 'Scout',
    aliases: ['scout', 'hey scout', 'scout,'],
    role: 'Playwright navigation agent. Direct page access and content extraction.',
    routes: 'Playwright service'
  }
};

/**
 * Build agent directory string for inclusion in system prompts
 */
export function buildAgentDirectory(): string {
  const lines = ['AVAILABLE AGENTS:', ''];
  
  Object.values(AGENTS).forEach(agent => {
    lines.push(`  • ${agent.name}: ${agent.role}`);
  });
  
  lines.push('');
  lines.push('Address agents by name when you need their help:');
  lines.push('  "Hey [Agent Name], [your request]"');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Find agent by name or alias (case-insensitive, loose matching)
 * Returns the agent definition if found, null otherwise
 */
export function findAgentByName(text: string): AgentDefinition | null {
  const lowerText = text.toLowerCase().trim();
  
  for (const agent of Object.values(AGENTS)) {
    // Check aliases first (most specific)
    if (agent.aliases.some(alias => lowerText.startsWith(alias.toLowerCase()))) {
      return agent;
    }
    // Check agent name
    if (lowerText.startsWith(agent.name.toLowerCase())) {
      return agent;
    }
  }
  
  return null;
}

/**
 * Extract agent name and intent from output text
 * Looks for patterns like "Hey [Agent], [request]" or "[Agent]: [request]"
 * 
 * Returns:
 *   { agentName: string, intent: string } if agent found
 *   null otherwise
 */
export function extractAgentMessage(text: string): { agentName: string; intent: string } | null {
  // Pattern 1: "Hey [Agent], [request]" or "[Agent], [request]"
  const commaPattern = /^(?:hey\s+)?([a-z\s\-]+?)[\s,]*[,:]?\s+(.+)$/i;
  const match = text.trim().match(commaPattern);
  
  if (!match) return null;
  
  const potentialName = match[1].trim();
  const intent = match[2].trim();
  
  const agent = findAgentByName(potentialName);
  if (!agent) return null;
  
  return {
    agentName: agent.name,
    intent
  };
}
