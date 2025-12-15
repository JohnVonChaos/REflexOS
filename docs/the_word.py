"""
THE WORD
========
Position Hash + Interference Pattern + Synset Expansion
The text IS the model. The positions ARE the embeddings.

Sub-millisecond inference. Perfect recall. No hallucination.
"""

import os
import re
import json
import glob
import time
import cmd
import requests
from collections import defaultdict
from pathlib import Path
from tqdm import tqdm
from typing import Dict, List, Tuple, Set, Optional

try:
    import keyboard
    HAS_KEYBOARD = True
except ImportError:
    HAS_KEYBOARD = False

# --- Retro Colors ---
class C:
    H = '\033[95m'  # Header
    B = '\033[94m'  # Blue
    C = '\033[96m'  # Cyan
    G = '\033[92m'  # Green
    W = '\033[93m'  # Warning
    F = '\033[91m'  # Fail
    R = '\033[0m'   # Reset
    D = '\033[90m'  # Dark/Grey


class Synsets:
    """Simple synset/thesaurus for semantic expansion."""
    
    def __init__(self):
        self.word_to_synset = {}  # word -> synset_id
        self.synset_to_words = defaultdict(set)  # synset_id -> {words}
        self.next_id = 0
    
    def add_group(self, words):
        """Add a synonym group (creates independent synsets per group)."""
        words = [w.lower().strip() for w in words if w.strip()]
        if len(words) < 2:
            return
        
        # Always create a new synset for this group
        synset_id = self.next_id
        self.next_id += 1
        
        # Add all words to this synset
        # Note: If a word already has a synset, we DON'T move it
        # This keeps synsets independent and prevents megamerges
        for w in words:
            if w not in self.word_to_synset:
                self.word_to_synset[w] = synset_id
                self.synset_to_words[synset_id].add(w)
    
    def get_synonyms(self, word):
        """Get all synonyms of a word (including itself)."""
        word = word.lower()
        if word not in self.word_to_synset:
            return {word}
        synset_id = self.word_to_synset[word]
        return self.synset_to_words[synset_id]
    
    def expand_words(self, words):
        """Expand a list of words with their synonyms."""
        expanded = set()
        for w in words:
            expanded.update(self.get_synonyms(w.lower()))
        return expanded
    
    def load_from_file(self, filepath):
        """Load synsets from CSV/text file (comma-separated synonyms per line)."""
        count = 0
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                parts = [w.strip().lower() for w in line.split(',')]
                clean = [p for p in parts if p and len(p) > 1]
                if len(clean) >= 2:
                    self.add_group(clean)
                    count += 1
        return count
    
    def save(self, filepath):
        """Save synsets to JSON."""
        data = {
            'word_to_synset': self.word_to_synset,
            'synset_to_words': {k: list(v) for k, v in self.synset_to_words.items()},
            'next_id': self.next_id
        }
        with open(filepath, 'w') as f:
            json.dump(data, f)
    
    def load(self, filepath):
        """Load synsets from JSON."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        self.word_to_synset = data['word_to_synset']
        self.synset_to_words = defaultdict(set, {int(k): set(v) for k, v in data['synset_to_words'].items()})
        self.next_id = data['next_id']


class PositionStack:
    """Ordinal precedence stack - blackjack deck, not time decay.
    
    Tracks correction layers where user feedback (corrections) are stacked
    on top of original generated positions. Higher layer = higher precedence.
    Think: bottom card is initial generation, top card is latest correction.
    """
    def __init__(self):
        self.layers = defaultdict(lambda: 0)  # pos -> layer_number
        self.current_layer = 0
    
    def add_layer(self, positions):
        """Push corrections to top of stack.
        
        Args:
            positions: Iterable of position indices to add to new layer
        
        Returns:
            layer_number: The new layer number
        """
        self.current_layer += 1
        for pos in positions:
            self.layers[pos] = self.current_layer
        return self.current_layer
    
    def get_layer(self, pos):
        """Get the layer number (precedence) for a position.
        
        Args:
            pos: Position index
            
        Returns:
            layer_number: 0 if not in stack, else current layer it was added to
        """
        return self.layers.get(pos, 0)
    
    def clear(self):
        """Reset the stack."""
        self.layers.clear()
        self.current_layer = 0


class QueryPatternMemory:
    """Store learned query → expected_relations mappings via correction feedback.
    
    When user corrects the model with "no, X", we extract the relation structure
    from the correction and associate it with the query. Future similar queries
    can then use these learned patterns.
    """
    def __init__(self):
        self.patterns = {}  # query_text -> pattern_data
        self.relations = None  # Set by PositionHash at init
    
    def learn_from_correction(self, query, wrong_output, correction):
        """Extract pattern from user correction.
        
        Args:
            query: The user's original query
            wrong_output: What the model generated (wrong)
            correction: What the user provided (correct)
        """
        if not query or not correction:
            return

        query_key = query.lower()

        # Extract relations from correction text into a temporary Relations
        # instance so we don't mutate the engine-wide relations store.
        from copy import deepcopy

        tokens = re.findall(r"[\w']+", correction.lower())
        temp_rel = Relations()
        # Use the extractor to populate relations for this correction (start_pos=0)
        try:
            temp_rel.extract_from_tokens(tokens, 0)
        except Exception:
            # Fallback: try simple extraction
            pass

        # Convert triples to simplified relation templates
        rel_templates = []
        for subj, rel_type, obj, pos, mods in temp_rel.triples:
            rel_templates.append((subj.lower(), rel_type.upper(), obj.lower()))

        # Store pattern: relation templates are used to bias future queries
        self.patterns[query_key] = {
            'correction_text': correction,
            'correction_tokens': tokens,
            'relation_triples': rel_templates,
            'timestamp': time.time()
        }
    
    def get_expected_patterns(self, query):
        """Retrieve learned pattern for this query.
        
        Args:
            query: User's query text
            
        Returns:
            pattern_data dict if found, else None
        """
        query_key = query.lower()
        if query_key in self.patterns:
            return self.patterns[query_key]

        # Simple fuzzy match: try to find the closest stored query using token overlap
        query_tokens = set(re.findall(r"[\w']+", query_key))
        best_key = None
        best_score = 0
        for k, v in self.patterns.items():
            k_tokens = set(re.findall(r"[\w']+", k))
            overlap = len(query_tokens & k_tokens)
            if overlap > best_score:
                best_score = overlap
                best_key = k

        if best_key and best_score > 0:
            return self.patterns[best_key]

        return None
    
    def get_all_patterns(self):
        """Return all learned patterns."""
        return self.patterns


class Relations:
    """Directed predicate triples extracted from text - THE WORLD MAP.
    
    Stores (subject, relation_type, object, position) tuples.
    Think of it as a concierge's client portfolio - tracking everything said about
    entities, their relationships, preferences, states, and desires.
    
    Categories:
    - IDENTITY: is, is_a, am, are (what things ARE)
    - TEMPORAL: was, were, will_be, used_to (past/future states)  
    - POSSESSION: has, have, had, owns (what things HAVE)
    - CAPABILITY: can, could, able_to (what things CAN do)
    - OBLIGATION: must, should, need, have_to (what things MUST do)
    - POSSIBILITY: may, might, could_be (what MIGHT happen)
    - DESIRE: want, like, love, need, prefer (what things WANT)
    - ACTION: does, did, will, going_to (what things DO)
    - RELATION: knows, loves, hates, with (relationships BETWEEN entities)
    
    Direction matters: (i, LOVE, you) ≠ (you, LOVE, i)
    """
    
    # Question-start patterns - skip extraction
    QUESTION_STARTS = {'is', 'are', 'was', 'were', 'do', 'does', 'did', 
                       'can', 'could', 'will', 'would', 'should', 'may', 'might',
                       'what', 'who', 'where', 'when', 'why', 'how', 'which'}

    # ----- PATCH: Structural Operators, Pronouns, Determiners, Quantifiers -----
    PRONOUNS = {
        'it', 'this', 'that', 'these', 'those',
        'they', 'them', 'he', 'she', 'him', 'her'
    }

    DETERMINERS = {
        'indefinite': {'a', 'an', 'some'},
        'definite': {'the'},
        'demonstrative': {'this', 'that', 'these', 'those'},
        'universal': {'all', 'every', 'each'},
        'existential': {'some', 'any'},
        'negative': {'no', 'none'},
    }

    CONJUNCTIONS = {'and', 'or', 'but', 'nor'}

    QUANTIFIERS = {
        'all', 'every', 'each', 'some', 'many', 'few', 'several', 'most', 'least', 'no', 'none'
    }

    COMPARATIVES = {
        'more', 'less', 'most', 'least', 'bigger', 'smaller', 'larger', 'greater',
        'better', 'worse', 'faster', 'slower',
    }

    CONDITIONALS = {
        'if', 'then', 'when', 'whenever', 'because', 'since', 'so', 'therefore',
        'unless', 'although', 'though',
    }

    META_TYPES = {
        'REFERS_TO', 'NEGATES', 'CORRECTS', 'ELABORATES', 'EXEMPLIFIES', 'IMPLIES', 'CAUSED_BY', 'CONTRASTS'
    }

    # Additional patterns provided by patch
    NEW_PATTERNS = [
        # MOST SPECIFIC PATTERNS FIRST (comparatives with IS, before generic IS)
        (r"(\w+)\s+(?:is|are)\s+(?:bigger|larger|greater)\s+than\s+(?:the\s+|a\s+)?(\w+)", "BIGGER_THAN"),
        (r"(\w+)\s+(?:is|are)\s+(?:smaller|less)\s+than\s+(?:the\s+|a\s+)?(\w+)", "SMALLER_THAN"),
        (r"(\w+)\s+(?:is|are)\s+(?:the\s+)?same\s+as\s+(\w+)", "SAME_AS"),
        (r"(\w+)\s+(?:is|are)\s+different\s+from\s+(\w+)", "DIFFERENT_FROM"),
        (r"(\w+)\s+(?:is|are)\s+(?:similar|like)\s+(\w+)", "SIMILAR_TO"),
        
        # IS_A patterns (identity with articles, before generic IS)
        (r"(\w+)\s+(?:am|is)\s+(?:also\s+)?a\s+(\w+)", "IS_A"),
        (r"(\w+)\s+(?:am|is)\s+(?:also\s+)?an\s+(\w+)", "IS_A"),
        # Multi-token object/location patterns
        (r"(\w+)\s+(?:is|are)\s+where\s+([\w\s']+)", "IS_LOCATION"),
        (r"(\w+)\s+(?:is|are)\s+to\s+([\w\s']+)", "MEANS_TO"),
        
        # GENERIC IS pattern (least specific, comes last)
        (r"(\w+)\s+(?:am|is)\s+(?:really\s+|definitely\s+)?(\w+)", "IS"),
        
        # Other relationships
        (r"(\w+)\s+causes\s+(\w+)", "CAUSES"),
        (r"(\w+)\s+enables\s+(\w+)", "ENABLES"),
        (r"(\w+)\s+prevents\s+(\w+)", "PREVENTS"),
        (r"(\w+)\s+(?:creates|produces)\s+(\w+)", "CREATES"),
        (r"(\w+)\s+(?:requires|needs)\s+(\w+)", "REQUIRES"),
        (r"(\w+)\s+(?:is\s+)?part\s+of\s+(\w+)", "PART_OF"),
        (r"(\w+)\s+(?:is\s+)?made\s+of\s+(\w+)", "MADE_OF"),
        (r"(\w+)\s+(?:is\s+)?composed\s+of\s+(\w+)", "COMPOSED_OF"),
        (r"(\w+)\s+includes\s+(\w+)", "INCLUDES"),
        (r"(\w+)\s+(?:happens\s+)?before\s+(\w+)", "BEFORE"),
        (r"(\w+)\s+(?:happens\s+)?after\s+(\w+)", "AFTER"),
        (r"(\w+)\s+during\s+(\w+)", "DURING"),
        (r"(\w+)\s+while\s+(\w+)", "WHILE"),
        # Common verbs not present in original PATTERNS
        (r"(\w+)\s+(?:learn|learns|learning)\s+(?:to\s+)?(\w+)", "LEARN"),
        (r"(\w+)\s+(?:sell|sells)\s+(\w+)", "SELL"),
        (r"(\w+)\s+(?:stop|stops)\s+(?:at\s+)?(\w+)", "STOP"),
        (r"(\w+)\s+(?:repair|repairs)\s+(\w+)", "REPAIR"),
        (r"(\w+)\s+(?:complain|complains)\s+about\s+(\w+)", "COMPLAIN"),
        (r"(\w+)\s+(?:inspect|inspects)\s+(\w+)", "INSPECT"),
        (r"(\w+)\s+(?:collect|collects)\s+(?:fares|money|tickets)", "COLLECT"),
        (r"(\w+)\s+(?:deliver|delivers)\s+(\w+)", "DELIVER"),
        (r"(\w+)\s+(?:arrive|arrives)\b", "ARRIVE"),
        (r"(\w+)\s+(?:depart|departs)\b", "DEPART"),
        (r"(\w+)\s+(?:greet|greets)\s+(\w+)", "GREET"),
        (r"(\w+)\s+(?:notify|notifies)\s+(\w+)", "NOTIFY"),
    ]
    
    # Personal pronouns we DO want to track (the "who" in the world map)
    PERSONS = {'i', 'you', 'we', 'he', 'she', 'they', 'it'}
    
    # Function words that CANNOT be semantic subjects
    FUNCTION_WORDS = {
        # Determiners (but NOT personal pronouns!)
        'a', 'an', 'the', 'this', 'that', 'these', 'those',
        # Auxiliaries
        'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'shall', 'should', 'can', 'could',
        'may', 'might', 'must', 'ought',
    }
    
    # Adverbs that signal spurious extraction when appearing as objects
    ADVERBS = {
        'together', 'apart', 'away', 'back', 'here', 'there',
        'now', 'then', 'always', 'never', 'often', 'sometimes',
        'very', 'quite', 'too', 'really', 'actually', 'just',
        'only', 'also', 'even', 'still', 'already', 'yet'
    }
    
    # ========== PREPOSITIONAL MODIFIER VOCABULARY ==========
    
    SPATIAL_MODIFIERS = {
        'in', 'inside', 'within',
        'at', 'on', 'upon', 'over', 'above',
        'under', 'below', 'beneath', 'underneath',
        'near', 'beside', 'by', 'next',
        'between', 'among', 'amid',
        'around', 'throughout',
        'across', 'along', 'through', 'via'
    }
    
    DIRECTIONAL_MODIFIERS = {
        'to', 'toward', 'towards', 'into',
        'from', 'out', 'away',
        'up', 'down', 'off'
    }
    
    TEMPORAL_MODIFIERS = {
        'during', 'while', 'when',
        'before', 'after', 'until', 'till',
        'since', 'for'
    }
    
    RELATIONAL_MODIFIERS = {
        'with', 'without',
        'about', 'regarding', 'concerning',
        'as', 'than', 'like'
    }
    
    CAUSAL_MODIFIERS = {
        'because', 'due', 'owing',
        'despite', 'although', 'though',
        'unless', 'except'
    }
    
    # All modifiers combined
    ALL_MODIFIERS = (SPATIAL_MODIFIERS | DIRECTIONAL_MODIFIERS | 
                     TEMPORAL_MODIFIERS | RELATIONAL_MODIFIERS |
                     CAUSAL_MODIFIERS)
    
    # Relation patterns: (regex_pattern, relation_type)
    # Order matters - more specific patterns first
    PATTERNS = [
        # === EXISTENCE / PERSISTENCE (what exists or continues) ===
        (r"(\w+)\s+(?:exist|exists|persists|remains|continues)\b", "EXISTS"),
        (r"(\w+)\s+(?:flow|flows|move|moves|travel|travels)\b", "FLOWS"),
        
        # === NEGATED FORMS (most specific first) ===
        (r"(\w+)\s+(?:do|does|did)\s+not\s+want\s+(?:to\s+)?(\w+)", "WANT_NOT"),
        (r"(\w+)\s+(?:do|does|did)\s+not\s+like\s+(\w+)", "LIKE_NOT"),
        (r"(\w+)\s+(?:do|does|did)\s+not\s+love\s+(\w+)", "LOVE_NOT"),
        (r"(\w+)\s+(?:do|does|did)\s+not\s+need\s+(\w+)", "NEED_NOT"),
        (r"(\w+)\s+(?:do|does|did)\s+not\s+have\s+(\w+)", "HAS_NOT"),
        (r"(\w+)\s+(?:doesn't|don't|didn't)\s+want\s+(?:to\s+)?(\w+)", "WANT_NOT"),
        (r"(\w+)\s+(?:doesn't|don't|didn't)\s+like\s+(\w+)", "LIKE_NOT"),
        (r"(\w+)\s+(?:doesn't|don't|didn't)\s+not\s+need\s+(\w+)", "NEED_NOT"),
        (r"(\w+)\s+(?:doesn't|don't|didn't)\s+have\s+(\w+)", "HAS_NOT"),
        (r"(\w+)\s+(?:can't|cannot|couldn't)\s+(\w+)", "CAN_NOT"),
        (r"(\w+)\s+(?:won't|wouldn't)\s+(\w+)", "WILL_NOT"),
        (r"(\w+)\s+(?:shouldn't|should\s+not)\s+(\w+)", "SHOULD_NOT"),
        (r"(\w+)\s+(?:mustn't|must\s+not)\s+(\w+)", "MUST_NOT"),
        (r"(\w+)\s+is\s+not\s+a\s+(\w+)", "IS_NOT_A"),
        (r"(\w+)\s+is\s+not\s+(\w+)", "IS_NOT"),
        (r"(\w+)\s+(?:am|are)\s+not\s+(\w+)", "IS_NOT"),
        (r"(\w+)\s+(?:was|were)\s+not\s+(\w+)", "WAS_NOT"),
        (r"(\w+)\s+has\s+no\s+(\w+)", "HAS_NOT"),
        
        # === DESIRE / PREFERENCE (what they want) ===
        (r"(\w+)\s+(?:want|wants)\s+to\s+(\w+)", "WANT_TO"),
        (r"(\w+)\s+(?:want|wants)\s+(\w+)", "WANT"),
        (r"(\w+)\s+(?:need|needs)\s+to\s+(\w+)", "NEED_TO"),
        (r"(\w+)\s+(?:need|needs)\s+(\w+)", "NEED"),
        (r"(\w+)\s+(?:like|likes)\s+to\s+(\w+)", "LIKE_TO"),
        (r"(\w+)\s+(?:like|likes)\s+(\w+)", "LIKE"),
        (r"(\w+)\s+(?:love|loves)\s+to\s+(\w+)", "LOVE_TO"),
        (r"(\w+)\s+(?:love|loves)\s+(\w+)", "LOVE"),
        (r"(\w+)\s+(?:hate|hates)\s+(\w+)", "HATE"),
        (r"(\w+)\s+(?:prefer|prefers)\s+(\w+)", "PREFER"),
        (r"(\w+)\s+(?:enjoy|enjoys)\s+(\w+)", "ENJOY"),
        
        # === OBLIGATION / NECESSITY (what they must do) ===
        (r"(\w+)\s+must\s+be\s+(\w+)", "MUST_BE"),
        (r"(\w+)\s+must\s+(\w+)", "MUST"),
        (r"(\w+)\s+should\s+be\s+(\w+)", "SHOULD_BE"),
        (r"(\w+)\s+should\s+(\w+)", "SHOULD"),
        (r"(\w+)\s+(?:have|has)\s+to\s+(\w+)", "HAVE_TO"),
        (r"(\w+)\s+(?:need|needs)\s+to\s+be\s+(\w+)", "NEED_TO_BE"),
        (r"(\w+)\s+ought\s+to\s+(\w+)", "OUGHT_TO"),
        
        # === POSSIBILITY (what might happen) ===
        (r"(\w+)\s+(?:may|might)\s+be\s+(\w+)", "MAY_BE"),
        (r"(\w+)\s+(?:may|might)\s+(\w+)", "MAY"),
        (r"(\w+)\s+could\s+be\s+(\w+)", "COULD_BE"),
        (r"(\w+)\s+could\s+(\w+)", "COULD"),
        (r"(\w+)\s+would\s+be\s+(\w+)", "WOULD_BE"),
        (r"(\w+)\s+would\s+(\w+)", "WOULD"),
        
        # === CAPABILITY (what they can do) ===
        (r"(\w+)\s+can\s+be\s+(\w+)", "CAN_BE"),
        (r"(\w+)\s+can\s+(\w+)", "CAN"),
        (r"(\w+)\s+(?:is|are)\s+able\s+to\s+(\w+)", "ABLE_TO"),
        
        # === FUTURE (what will happen) ===
        (r"(\w+)\s+will\s+be\s+(\w+)", "WILL_BE"),
        (r"(\w+)\s+will\s+(\w+)", "WILL"),
        (r"(\w+)\s+(?:is|are|am)\s+going\s+to\s+(\w+)", "GOING_TO"),
        (r"(\w+)\s+(?:is|are|am)\s+gonna\s+(\w+)", "GOING_TO"),
        
        # === PAST / TEMPORAL (what was) ===
        (r"(\w+)\s+used\s+to\s+be\s+(\w+)", "USED_TO_BE"),
        (r"(\w+)\s+used\s+to\s+(\w+)", "USED_TO"),
        (r"(\w+)\s+was\s+a\s+(\w+)", "WAS_A"),
        (r"(\w+)\s+was\s+(\w+)", "WAS"),
        (r"(\w+)\s+were\s+(\w+)", "WAS"),
        (r"(\w+)\s+had\s+been\s+(\w+)", "HAD_BEEN"),
        (r"(\w+)\s+had\s+(\w+)", "HAD"),
        
        # === IDENTITY (what things are) ===
        (r"(\w+)\s+(?:am|is)\s+a\s+(\w+)", "IS_A"),
        (r"(\w+)\s+(?:am|is)\s+an\s+(\w+)", "IS_A"),
        (r"(\w+)\s+(?:am|is)\s+(\w+)", "IS"),
        (r"(\w+)\s+are\s+(\w+)", "IS"),
        (r"(\w+)\s+(?:'m|'re|'s)\s+(\w+)", "IS"),  # contractions
        
        # === POSSESSION (what they have) ===
        (r"(\w+)\s+(?:have|has)\s+a\s+(\w+)", "HAS_A"),
        (r"(\w+)\s+(?:have|has)\s+(\w+)", "HAS"),
        (r"(\w+)\s+(?:own|owns)\s+(\w+)", "OWNS"),
        (r"(\w+)'s\s+(\w+)", "POSSESSIVE"),  # john's car
        
        # === RELATIONSHIPS (connections between entities) ===
        (r"(\w+)\s+(?:know|knows)\s+(\w+)", "KNOWS"),
        (r"(\w+)\s+(?:is|am|are)\s+with\s+(\w+)", "WITH"),
        (r"(\w+)\s+(?:belong|belongs)\s+to\s+(\w+)", "BELONGS_TO"),
        (r"(\w+)\s+(?:is|am|are)\s+(?:your|my|his|her|their|our)\s+(\w+)", "ROLE"),
        
        # === ACTIONS (what they do) ===
        (r"(\w+)\s+(?:make|makes)\s+(\w+)", "MAKE"),
        (r"(\w+)\s+(?:give|gives)\s+(\w+)", "GIVE"),
        (r"(\w+)\s+(?:take|takes)\s+(\w+)", "TAKE"),
        (r"(\w+)\s+(?:get|gets)\s+(\w+)", "GET"),
        (r"(\w+)\s+(?:feel|feels)\s+(\w+)", "FEEL"),
        (r"(\w+)\s+(?:think|thinks)\s+(\w+)", "THINK"),
        (r"(\w+)\s+(?:say|says)\s+(\w+)", "SAY"),
        (r"(\w+)\s+(?:mean|means)\s+(\w+)", "MEAN"),
        (r"(\w+)\s+(?:carry|carries)\s+(\w+)", "CARRY"),
        (r"(\w+)\s+(?:serve|serves)\s+(?:as\s+)?(\w+)", "SERVE"),
        (r"(\w+)\s+(?:transport|transports)\s+(\w+)", "TRANSPORT"),
        (r"(\w+)\s+(?:operate|operates)\s+(\w+)", "OPERATE"),
        (r"(\w+)\s+(?:move|moves)\s+(\w+)", "MOVE"),
        (r"(\w+)\s+(?:work|works)\s+(?:as\s+)?(\w+)", "WORK"),
        (r"(\w+)\s+(?:serve|serves)\s+(?:as\s+)?(\w+)", "SERVE_AS"),
        (r"(\w+)\s+(?:provide|provides)\s+(\w+)", "PROVIDE"),
        (r"(\w+)\s+(?:offer|offers)\s+(\w+)", "OFFER"),
        (r"(\w+)\s+(?:connect|connects)\s+(?:to\s+)?(\w+)", "CONNECT"),
        (r"(\w+)\s+(?:apologize|apologizes)\b", "APOLOGIZE"),
        (r"(\w+)\s+(?:wait|waits)\b", "WAIT"),
        
        # === CONTAINMENT / SPATIAL ===
        (r"(\w+)\s+(?:contain|contains)\s+(\w+)", "CONTAINS"),
        (r"(\w+)\s+(?:is|are)\s+in\s+(\w+)", "IN"),
        (r"(\w+)\s+(?:is|are)\s+at\s+(\w+)", "AT"),
        (r"(\w+)\s+(?:is|are)\s+from\s+(\w+)", "FROM"),
    ]
    
    # All unique relation types for reference
    RELATION_TYPES = [
        # Existence
        'EXISTS', 'PERSISTS', 'REMAINS', 'CONTINUES',
        'FLOWS', 'MOVES', 'TRAVELS',
        # Identity
        'IS', 'IS_A', 'IS_NOT', 'IS_NOT_A',
        # Temporal  
        'WAS', 'WAS_A', 'WAS_NOT', 'WILL_BE', 'WILL', 'WILL_NOT',
        'USED_TO', 'USED_TO_BE', 'HAD_BEEN', 'GOING_TO',
        # Possession
        'HAS', 'HAS_A', 'HAS_NOT', 'HAD', 'OWNS', 'POSSESSIVE',
        # Capability
        'CAN', 'CAN_BE', 'CAN_NOT', 'ABLE_TO',
        # Obligation
        'MUST', 'MUST_BE', 'MUST_NOT', 'SHOULD', 'SHOULD_BE', 'SHOULD_NOT',
        'HAVE_TO', 'NEED_TO', 'NEED_TO_BE', 'OUGHT_TO',
        # Possibility
        'MAY', 'MAY_BE', 'MIGHT', 'COULD', 'COULD_BE', 'WOULD', 'WOULD_BE',
        # Desire
        'WANT', 'WANT_TO', 'WANT_NOT', 'NEED', 'NEED_NOT',
        'LIKE', 'LIKE_TO', 'LIKE_NOT', 'LOVE', 'LOVE_TO', 'LOVE_NOT',
        'HATE', 'PREFER', 'ENJOY',
        # Relationships
        'KNOWS', 'WITH', 'BELONGS_TO', 'ROLE',
        # Actions
        'MAKE', 'GIVE', 'TAKE', 'GET', 'FEEL', 'THINK', 'SAY', 'MEAN',
        # Spatial
        'CONTAINS', 'IN', 'AT', 'FROM',
    ]
    
    def __init__(self):
        # List of (subject, relation_type, object, position, modifiers)
        self.triples = []
        # Index: subject -> [(relation_type, object, position, modifiers), ...]
        self.by_subject = defaultdict(list)
        # Index: object -> [(subject, relation_type, position, modifiers), ...]
        self.by_object = defaultdict(list)
        # Index: relation_type -> [(subject, object, position, modifiers), ...]
        self.by_relation = defaultdict(list)
        # NEW: Index: modifier -> [(subject, relation_type, object, position), ...]
        self.by_modifier = defaultdict(list)
        
        # Meta-relational graph: (source_pos, meta_type, target_pos)
        # Links negations/corrections to what they target
        self.meta_relations = []
        # Convenience set of positions that have been negated
        self.deprecated = set()
        # NEW: Track conversation context for pronoun resolution
        self.recent_subjects = []  # Last N subjects mentioned (FIFO)
        self.recent_objects = []   # Last N objects mentioned
        self.context_window = 10   # Remember last 10 entities

        # NEW: Track determiners for entity specificity
        self.entity_specificity = {}  # entity -> 'new'|'known'|'deictic'
    
    def extract_from_tokens(self, tokens, start_pos):
        """Enhanced extraction with structural operator handling.

        This version splits clauses on conjunctions, handles simple conditionals,
        resolves pronouns against recent context, detects quantifiers and
        determiners, and merges new patterns from the patch.
        """
        text = ' '.join(tokens)
        count = 0

        # Reset last subject at start of sentence-level extraction to avoid
        # carrying subjects across separate sentences (carryover is handled
        # within clause splitting inside this function).
        self._last_subject = getattr(self, '_last_subject', None)

        # Skip questions only when punctuation indicates a question.
        # Previously we skipped all clauses that started with auxiliaries
        # like 'will' which prevented extraction for declarative sentences
        # that begin with such words (e.g., 'will is to ...'). Only skip
        # when a question mark is present.
        if '?' in text:
            return 0

        # === PHASE 1: DETECT STRUCTURAL OPERATORS ===
        clauses = self._split_by_conjunctions(tokens)

        for clause_tokens in clauses:
            # clause_text will be (re)computed after any clause token modifications
            clause_text = ' '.join(clause_tokens)

            # === PHASE 2: DETECT CONDITIONALS (IF-THEN) ===
            if self._has_conditional(clause_tokens):
                count += self._extract_conditional(clause_tokens, start_pos)
                continue


            # Carry over implicit subject from previous clause if needed
            # (e.g., "He learns baking and makes bread" → second clause lacks explicit subject)
            if clause_tokens:
                first = clause_tokens[0].lower()
                # If the clause starts with a verb (common in coordinated clauses), prepend last subject
                common_verbs = {'make','makes','learn','learns','sell','sells','stop','stops','repair','repairs','complain','complains','inspect','inspects','collect','collects','deliver','delivers','arrive','arrives','depart','departs','greet','greets','notify','notifies','move','moves','apologize','apologizes','wait','waits'}
                # Do not treat modal auxiliaries (will, would, can, could, etc.)
                # as a signal to carry over a previous subject - they often
                # introduce declarative or infinitival structures instead.
                modal_aux = {'will','would','can','could','may','might','must','shall','should'}
                if ((first in self.ALL_MODIFIERS or (first in self.FUNCTION_WORDS and first not in modal_aux) or
                     (len(first) < 2 and first not in self.PERSONS)) and hasattr(self, '_last_subject') and self._last_subject):
                    clause_tokens = [self._last_subject] + clause_tokens
                elif first in common_verbs or first.rstrip('s') in common_verbs:
                    if hasattr(self, '_last_subject') and self._last_subject:
                        clause_tokens = [self._last_subject] + clause_tokens

            # Recompute clause_text if clause_tokens were modified above
            clause_text = ' '.join(clause_tokens)

            # If clause contains pronouns anywhere, add REFERS_TO links for them
            for token in list(clause_tokens):
                if token.lower() in self.PRONOUNS:
                    resolved = self._resolve_pronoun(token.lower(), start_pos)
                    if resolved:
                        self._add_meta_relation(start_pos, 'REFERS_TO', resolved)

            # === PHASE 3: STANDARD PATTERN EXTRACTION ===
            # Prefer longer/new patterns first to avoid short patterns shadowing them
            pattern_list = (self.NEW_PATTERNS if hasattr(self, 'NEW_PATTERNS') else []) + self.PATTERNS
            used_spans = []
            for pattern, rel_type in pattern_list:
                for match in re.finditer(pattern, clause_text, re.IGNORECASE):
                    # Debugging: show matches for clauses with 'will' to diagnose why
                    # multi-token 'to' patterns may not be creating triples.
                    if 'will' in clause_text.lower():
                        try:
                            print(f"DEBUG: pattern={pattern} rel_type={rel_type} match={match.groups()}")
                        except Exception:
                            print(f"DEBUG: pattern={pattern} rel_type={rel_type} match=<error showing groups>")
                    span = match.span()
                    # Skip if overlaps a previously used span
                    if any(not (span[1] <= s[0] or span[0] >= s[1]) for s in used_spans):
                        continue
                    subj = match.group(1).lower().strip()

                    try:
                        obj = match.group(2).lower().strip()
                    except IndexError:
                        obj = None

                    # === SUBJECT VALIDATION ===
                    # Allow certain function words (modals, auxiliaries) to
                    # be treated as subjects for definitional patterns like IS/IS_A
                    # or MEANS_TO (e.g., "will is to talk about the future").
                    if subj in self.FUNCTION_WORDS and rel_type not in ('IS', 'IS_A', 'IS_LOCATION', 'MEANS_TO'):
                        continue
                    if subj in self.ALL_MODIFIERS:
                        continue
                    if len(subj) < 2 and subj not in self.PERSONS:
                        continue

                    # === PRONOUN RESOLUTION ===
                    if subj in self.PRONOUNS:
                        resolved_subj = self._resolve_pronoun(subj, start_pos)
                        if resolved_subj:
                            self._add_meta_relation(start_pos, 'REFERS_TO', resolved_subj)
                            subj = resolved_subj
                        else:
                            continue

                    # === OBJECT VALIDATION ===
                    if obj:
                        if obj in self.ADVERBS:
                            continue
                        if obj in {'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been'}:
                            continue
                        if len(obj) < 2:
                            continue

                        if obj in self.PRONOUNS:
                            resolved_obj = self._resolve_pronoun(obj, start_pos)
                            if resolved_obj:
                                self._add_meta_relation(start_pos, 'REFERS_TO', resolved_obj)
                                obj = resolved_obj

                    # === QUANTIFIER DETECTION ===
                    quantifier = self._detect_quantifier(clause_tokens)
                    if quantifier:
                        rel_type = f"{quantifier}_{rel_type}"

                    # === DETERMINER DETECTION ===
                    determiner_type = self._detect_determiner(clause_tokens, subj)
                    if determiner_type:
                        self.entity_specificity[subj] = determiner_type

                    # === EXTRACT MODIFIERS ===
                    match_end = match.end()
                    remaining_text = clause_text[match_end:match_end + 100]
                    modifiers = self._extract_modifiers(remaining_text)

                    # === CALCULATE POSITION ===
                    try:
                        subj_idx = clause_tokens.index(subj)
                        pos = start_pos + subj_idx
                    except ValueError:
                        pos = start_pos

                    # === ADD TRIPLE ===
                    self._add_triple(subj, rel_type, obj, pos, modifiers)
                    # Record last explicit subject for carryover to later clauses
                    self._last_subject = subj
                    used_spans.append(span)
                    count += 1

                    # === UPDATE CONTEXT ===
                    self._update_context(subj, obj)

        return count
    
    def _extract_modifiers(self, phrase):
        """Extract prepositional modifiers with coordination support.
        
        Returns list of modifiers: ["IN:system", "THROUGH:experience", "TO:memory"]
        """
        modifiers = []
        phrase_lower = phrase.lower()
        
        # Find each preposition in the phrase, in order of appearance
        matches = []
        for prep in self.ALL_MODIFIERS:
            pattern = r'\b' + re.escape(prep) + r'\b'
            for match in re.finditer(pattern, phrase_lower):
                matches.append((match.start(), match.end(), prep.upper()))
        
        # Sort matches by position
        matches.sort(key=lambda x: x[0])
        
        # Extract nouns after each preposition (until next preposition or punctuation)
        for i, (start, end, prep) in enumerate(matches):
            # Find where this preposition's nouns end (at next prep, or at phrase end)
            if i + 1 < len(matches):
                next_prep_pos = matches[i + 1][0]
            else:
                next_prep_pos = len(phrase)
            
            # Extract text between this prep and next prep
            following = phrase[end:next_prep_pos]
            
            # Split by punctuation
            following = re.split(r'[.,;!?]', following)[0]
            
            # Find all words
            words = re.findall(r'\b(\w+)\b', following)
            
            found_noun = False
            for word in words:
                word_lower = word.lower()
                # Skip articles and conjunctions
                if word_lower in {'the', 'a', 'an', 'or', 'and', 'but', 'if'}:
                    continue
                # Skip if it's another preposition (indicates we've gone too far)
                if word_lower in self.ALL_MODIFIERS:
                    break  # Stop scanning when we hit another preposition
                # Skip function words and adverbs
                if word_lower in self.FUNCTION_WORDS or word_lower in self.ADVERBS:
                    continue
                # Skip short words unless they're pronouns
                if len(word_lower) < 2 and word_lower not in self.PERSONS:
                    continue
                
                # Found a valid noun - add it and keep looking for coordinated items
                modifiers.append(f"{prep}:{word_lower}")
                found_noun = True
        
        return modifiers
    
    def _add_triple(self, subject, relation, obj, position, modifiers=None):
        """Add a triple with modifiers to all indices."""
        if modifiers is None:
            modifiers = []
        
        triple = (subject, relation, obj, position, modifiers)
        self.triples.append(triple)
        
        # Index by subject
        self.by_subject[subject].append((relation, obj, position, modifiers))
        
        # Index by object (if present)
        if obj:
            self.by_object[obj].append((subject, relation, position, modifiers))
        
        # Index by relation
        self.by_relation[relation].append((subject, obj, position, modifiers))
        
        # NEW: Index by modifier
        for mod in modifiers:
            # Extract base modifier (before colon): "IN:system" → "IN"
            base_mod = mod.split(':')[0]
            self.by_modifier[base_mod].append((subject, relation, obj, position))
    
    def extract_negation_links(self, negation_pos, target_positions):
        """Link a negation to the positions it negates.
        
        Args:
            negation_pos: position where negation was detected
            target_positions: list of positions being negated (from last interference)
        """
        for target_pos in target_positions:
            self._add_meta_relation(negation_pos, 'NEGATES', target_pos)
            self.deprecated.add(target_pos)

    def _add_meta_relation(self, src_pos, rel_type, tgt_pos_or_entity):
        """Add a meta-relation if it doesn't already exist (dedupe).

        Keeps `meta_relations` as a list for compatibility but avoids duplicates.
        """
        meta_triple = (src_pos, rel_type, tgt_pos_or_entity)
        if meta_triple not in self.meta_relations:
            self.meta_relations.append(meta_triple)

    # ========== PRONOUN RESOLUTION ==========

    def _resolve_pronoun(self, pronoun, current_pos):
        """Resolve pronoun to most recent appropriate referent.

        Args:
            pronoun: The pronoun token ('it', 'this', 'that', etc.)
            current_pos: Current position in corpus

        Returns:
            Resolved entity string, or None if can't resolve
        """
        pronoun = pronoun.lower()

        # Singular pronouns -> look for last singular subject
        if pronoun in {'it', 'this', 'that', 'he', 'she', 'him', 'her'}:
            if self.recent_subjects:
                candidate = self.recent_subjects[-1]
                # If candidate is a type (e.g., 'baker') and there exists an instance
                # declared earlier (e.g., 'john IS_A baker'), prefer the instance
                for subj, rel, obj, pos, mods in reversed(self.triples):
                    if rel == 'IS_A' and obj == candidate and pos <= current_pos:
                        return subj
                return candidate

        # Plural pronouns -> look for last plural subject or set
        elif pronoun in {'they', 'them', 'these', 'those'}:
            if self.recent_subjects:
                # TODO: Handle plural properly (might need set of entities)
                return self.recent_subjects[-1]

        return None

    def _update_context(self, subject, obj):
        """Update recent entity context for pronoun resolution."""
        if subject and subject not in self.PRONOUNS:
            self.recent_subjects.append(subject)
            if len(self.recent_subjects) > self.context_window:
                self.recent_subjects.pop(0)

        if obj and obj not in self.PRONOUNS:
            self.recent_objects.append(obj)
            if len(self.recent_objects) > self.context_window:
                self.recent_objects.pop(0)

    # ========== CONJUNCTION HANDLING ==========

    def _split_by_conjunctions(self, tokens):
        """Split token sequence into clauses at conjunctions.

        Returns:
            List of clause token lists
        """
        clauses = []
        current_clause = []

        for token in tokens:
            if token.lower() in self.CONJUNCTIONS:
                if current_clause:
                    clauses.append(current_clause)
                    current_clause = []
                # TODO: Store conjunction type for meta-relation
            else:
                current_clause.append(token)

        if current_clause:
            clauses.append(current_clause)

        return clauses if clauses else [tokens]

    # ========== QUANTIFIER DETECTION ==========

    def _detect_quantifier(self, tokens):
        """Detect quantifier in token sequence.

        Returns:
            'ALL', 'SOME', 'MOST', 'NO', or None
        """
        for token in tokens:
            t_lower = token.lower()
            if t_lower in {'all', 'every', 'each'}:
                return 'ALL'
            elif t_lower in {'some', 'many', 'several'}:
                return 'SOME'
            elif t_lower == 'most':
                return 'MOST'
            elif t_lower in {'no', 'none'}:
                return 'NO'
        return None

    # ========== DETERMINER DETECTION ==========

    def _detect_determiner(self, tokens, entity):
        """Detect determiner type for entity.

        Returns:
            'new', 'known', 'deictic', or None
        """
        # Look for determiner immediately before entity
        try:
            entity_idx = tokens.index(entity)
            if entity_idx > 0:
                prev_token = tokens[entity_idx - 1].lower()

                if prev_token in self.DETERMINERS['indefinite']:
                    return 'new'
                elif prev_token in self.DETERMINERS['definite']:
                    return 'known'
                elif prev_token in self.DETERMINERS['demonstrative']:
                    return 'deictic'
        except ValueError:
            pass

        return None

    # ========== CONDITIONAL EXTRACTION ==========

    def _has_conditional(self, tokens):
        """Check if clause contains conditional structure."""
        return any(t.lower() in self.CONDITIONALS for t in tokens)

    def _extract_conditional(self, tokens, start_pos):
        """Extract IF-THEN or BECAUSE causal relations.

        Returns:
            Number of relations extracted
        """
        text = ' '.join(tokens)
        count = 0

        # IF X THEN Y pattern
        if_then = re.search(r'if\s+(.+?)\s+then\s+(.+)', text, re.IGNORECASE)
        if if_then:
            condition = if_then.group(1).strip()
            consequence = if_then.group(2).strip()

            # Extract relations from both clauses
            cond_rels = self._extract_simple_relations(condition, start_pos)
            cons_rels = self._extract_simple_relations(consequence, start_pos + 10)

            # Link them with IMPLIES meta-relation
            if cond_rels and cons_rels:
                self._add_meta_relation(cond_rels[0][3], 'IMPLIES', cons_rels[0][3])
                count += len(cond_rels) + len(cons_rels)

        # X BECAUSE Y pattern
        because = re.search(r'(.+?)\s+because\s+(.+)', text, re.IGNORECASE)
        if because:
            effect = because.group(1).strip()
            cause = because.group(2).strip()

            effect_rels = self._extract_simple_relations(effect, start_pos)
            cause_rels = self._extract_simple_relations(cause, start_pos + 10)

            if effect_rels and cause_rels:
                self._add_meta_relation(effect_rels[0][3], 'CAUSED_BY', cause_rels[0][3])
                count += len(effect_rels) + len(cause_rels)

        return count

    def _extract_simple_relations(self, text, pos):
        """Helper: extract relations from a simple clause."""
        # Simplified extraction - perform a single-pass pattern match and add
        # triples without invoking higher-level conditional handling.
        created = []
        clause = text.lower()
        tokens = re.findall(r"[\w']+", clause)

        pattern_list = (self.NEW_PATTERNS if hasattr(self, 'NEW_PATTERNS') else []) + self.PATTERNS
        used_spans = []
        for pattern, rel_type in pattern_list:
            for match in re.finditer(pattern, clause, re.IGNORECASE):
                span = match.span()
                if any(not (span[1] <= s[0] or span[0] >= s[1]) for s in used_spans):
                    continue
                subj = match.group(1).lower().strip()
                try:
                    obj = match.group(2).lower().strip()
                except IndexError:
                    obj = None

                # Basic validation (similar to main extractor)
                # Handle leading determiners captured as subject (e.g., 'a car is...')
                dets = set().union(*self.DETERMINERS.values()) if hasattr(self, 'DETERMINERS') else set()
                if subj in dets and tokens:
                    # pick next token as subject if available
                    try:
                        nxt = tokens[tokens.index(subj) + 1]
                        subj = nxt
                    except (ValueError, IndexError):
                        pass

                if subj in self.FUNCTION_WORDS or subj in self.ALL_MODIFIERS:
                    continue
                if len(subj) < 2 and subj not in self.PERSONS:
                    continue
                if obj:
                    if obj in self.ADVERBS:
                        continue
                    if len(obj) < 2:
                        continue

                # Compute position relative to provided pos
                try:
                    subj_idx = tokens.index(subj)
                    rel_pos = pos + subj_idx
                except ValueError:
                    rel_pos = pos

                # Add the triple and record it
                self._add_triple(subj, rel_type, obj, rel_pos, [])
                created.append((subj, rel_type, obj, rel_pos))
                # Record last explicit subject for carryover
                self._last_subject = subj
                used_spans.append(span)

        return created

    # ========== API ENHANCEMENTS ==========

    def get_referent(self, pronoun, context_pos):
        """Public API: resolve pronoun at given position."""
        return self._resolve_pronoun(pronoun, context_pos)

    def get_entity_specificity(self, entity):
        """Get determiner type for entity (new/known/deictic)."""
        return self.entity_specificity.get(entity, 'unknown')

    def get_meta_relations_for(self, position):
        """Get all meta-relations involving this position."""
        return [
            (src, typ, tgt) for src, typ, tgt in self.meta_relations
            if src == position or tgt == position
        ]

    def answer_what_is(self, entity):
        """Return a short natural-language answer to 'what is X'."""
        entity = entity.lower()
        profile = self.get_entity_profile(entity)
        identities = profile.get('identity', [])
        if not identities:
            return "No information found."

        # Choose the most recent identity (highest position)
        identities.sort(key=lambda x: x[2], reverse=True)
        rel, obj, pos, role = identities[0]

        # Choose determiner if available
        det = self.entity_specificity.get(entity, None)
        if det == 'known':
            prefix = 'The '
        elif det == 'deictic':
            prefix = 'This '
        else:
            prefix = 'A '

        return f"{prefix}{entity} is {obj}."
    
    def get_relations_for(self, word, as_subject=True, as_object=True):
        """Get all relations involving a word."""
        results = []
        word = word.lower()
        if as_subject:
            results.extend([(word, r, o, p) for r, o, p, m in self.by_subject.get(word, [])])
        if as_object:
            results.extend([(s, r, word, p) for s, r, p, m in self.by_object.get(word, [])])
        return results
    
    def get_by_relation_type(self, rel_type):
        """Get all triples of a specific relation type."""
        return [(s, rel_type, o, p) for s, o, p, m in self.by_relation.get(rel_type, [])]
    
    def get_positions_for(self, word):
        """Get all positions where this word participates in a relation."""
        positions = set()
        for _, _, pos, _ in self.by_subject.get(word.lower(), []):
            positions.add(pos)
        for _, _, pos, _ in self.by_object.get(word.lower(), []):
            positions.add(pos)
        return sorted(positions)
    
    def stats(self):
        """Return relation statistics."""
        return {
            'total_triples': len(self.triples),
            'unique_subjects': len(self.by_subject),
            'unique_objects': len(self.by_object),
            'relation_types': {k: len(v) for k, v in self.by_relation.items()},
            'modifier_usage': {k: len(v) for k, v in self.by_modifier.items()}
        }
    
    def get_entity_profile(self, entity):
        """Get a complete profile for an entity - like a concierge's client notes.
        
        Returns a dict organized by relationship category:
        - identity: what they ARE
        - was: what they WERE  
        - has: what they HAVE
        - wants: what they WANT/LIKE/LOVE
        - can: what they CAN do
        - must: what they MUST/SHOULD do
        - might: what MIGHT happen
        - will: what they WILL do
        - relationships: WHO they're connected to
        - actions: what they DO
        """
        entity = entity.lower()
        profile = {
            'identity': [],      # IS, IS_A, IS_NOT
            'was': [],           # WAS, USED_TO, HAD_BEEN
            'has': [],           # HAS, OWNS, POSSESSIVE
            'wants': [],         # WANT, LIKE, LOVE, NEED, PREFER, ENJOY
            'can': [],           # CAN, ABLE_TO
            'must': [],          # MUST, SHOULD, HAVE_TO, OUGHT_TO
            'might': [],         # MAY, MIGHT, COULD, WOULD
            'will': [],          # WILL, GOING_TO
            'relationships': [], # KNOWS, WITH, BELONGS_TO, ROLE, LOVE (person)
            'actions': [],       # MAKE, GIVE, TAKE, GET, FEEL, THINK
            'location': [],      # IN, AT, FROM
        }
        
        # Category mapping
        category_map = {
            'IS': 'identity', 'IS_A': 'identity', 'IS_NOT': 'identity', 'IS_NOT_A': 'identity',
            'WAS': 'was', 'WAS_A': 'was', 'WAS_NOT': 'was', 'USED_TO': 'was', 
            'USED_TO_BE': 'was', 'HAD_BEEN': 'was', 'HAD': 'was',
            'HAS': 'has', 'HAS_A': 'has', 'HAS_NOT': 'has', 'OWNS': 'has', 'POSSESSIVE': 'has',
            'WANT': 'wants', 'WANT_TO': 'wants', 'WANT_NOT': 'wants',
            'NEED': 'wants', 'NEED_TO': 'wants', 'NEED_NOT': 'wants',
            'LIKE': 'wants', 'LIKE_TO': 'wants', 'LIKE_NOT': 'wants',
            'LOVE': 'wants', 'LOVE_TO': 'wants', 'LOVE_NOT': 'wants',
            'HATE': 'wants', 'PREFER': 'wants', 'ENJOY': 'wants',
            'CAN': 'can', 'CAN_BE': 'can', 'CAN_NOT': 'can', 'ABLE_TO': 'can',
            'MUST': 'must', 'MUST_BE': 'must', 'MUST_NOT': 'must',
            'SHOULD': 'must', 'SHOULD_BE': 'must', 'SHOULD_NOT': 'must',
            'HAVE_TO': 'must', 'NEED_TO_BE': 'must', 'OUGHT_TO': 'must',
            'MAY': 'might', 'MAY_BE': 'might', 'MIGHT': 'might',
            'COULD': 'might', 'COULD_BE': 'might', 'WOULD': 'might', 'WOULD_BE': 'might',
            'WILL': 'will', 'WILL_BE': 'will', 'WILL_NOT': 'will', 'GOING_TO': 'will',
            'KNOWS': 'relationships', 'WITH': 'relationships', 
            'BELONGS_TO': 'relationships', 'ROLE': 'relationships',
            'MAKE': 'actions', 'GIVE': 'actions', 'TAKE': 'actions', 
            'GET': 'actions', 'FEEL': 'actions', 'THINK': 'actions',
            'SAY': 'actions', 'MEAN': 'actions',
            'CONTAINS': 'location', 'IN': 'location', 'AT': 'location', 'FROM': 'location',
        }
        
        # Collect as subject
        for rel, obj, pos, mods in self.by_subject.get(entity, []):
            category = category_map.get(rel, 'actions')
            profile[category].append((rel, obj, pos, 'subject'))
        
        # Collect as object (they are the target of the relation)
        for subj, rel, pos, mods in self.by_object.get(entity, []):
            category = category_map.get(rel, 'actions')
            profile[category].append((rel, subj, pos, 'object'))
        
        return profile
    
    def get_world_map(self):
        """Get a summary of all entities and their key relationships.
        
        Returns dict of {entity: {category: count}} for quick overview.
        Like a hotel's guest registry with preference tags.
        """
        world = {}
        
        for entity in set(list(self.by_subject.keys()) + list(self.by_object.keys())):
            profile = self.get_entity_profile(entity)
            # Summarize non-empty categories
            summary = {k: len(v) for k, v in profile.items() if v}
            if summary:
                world[entity] = summary
        
        return world
    
    def get_relationship_between(self, entity1, entity2):
        """Get all relations between two specific entities.
        
        Returns list of (subject, relation, object, position) tuples.
        """
        entity1, entity2 = entity1.lower(), entity2.lower()
        results = []
        
        # entity1 -> entity2
        for rel, obj, pos, mods in self.by_subject.get(entity1, []):
            if obj == entity2:
                results.append((entity1, rel, entity2, pos))
        
        # entity2 -> entity1
        for rel, obj, pos, mods in self.by_subject.get(entity2, []):
            if obj == entity1:
                results.append((entity2, rel, entity1, pos))
        
        return results
    
    def save(self, filepath):
        """Save relations to JSON (version 3: includes modifiers and meta-relations)."""
        data = {
            'version': 3,
            'triples': self.triples,
            'meta_relations': self.meta_relations,
            'deprecated': list(self.deprecated)
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    def load(self, filepath):
        """Load relations from JSON (version 3: includes modifiers)."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        self.triples = []
        self.by_subject = defaultdict(list)
        self.by_object = defaultdict(list)
        self.by_relation = defaultdict(list)
        self.by_modifier = defaultdict(list)
        
        version = data.get('version', 1)
        
        for triple in data.get('triples', []):
            # Handle old (v1/v2) and new (v3) formats
            if len(triple) == 4:
                # Old format: (subj, rel, obj, pos)
                subj, rel, obj, pos = triple
                modifiers = []
            else:
                # New format: (subj, rel, obj, pos, modifiers)
                subj, rel, obj, pos, modifiers = triple
            
            self._add_triple(subj, rel, obj, pos, modifiers)
        
        # Load meta-relations if version >= 2
        if version >= 2:
            self.meta_relations = data.get('meta_relations', [])
            self.deprecated = set(data.get('deprecated', []))
        else:
            # Legacy v1 files have no meta-relations
            self.meta_relations = []
            self.deprecated = set()


class BeatContext:
    """Tracks interference centers across turns - the 'beat frequency' of conversation.
    
    No artificial limits. Let coherence degrade naturally to find the boundary.
    The context is NOT the positions themselves, but the PATTERN of movement between them.
    """
    
    def __init__(self):
        # List of (position, timestamp) for each turn's best interference hit
        self.turn_centers = []
        # Computed deltas between consecutive centers
        self.deltas = []
        # Running statistics
        self.mean_delta = 0
        self.delta_variance = 0
    
    def add_turn(self, position):
        """Record a new turn's interference center."""
        timestamp = time.time()
        self.turn_centers.append((position, timestamp))
        
        # Compute delta from previous turn
        if len(self.turn_centers) >= 2:
            prev_pos, _ = self.turn_centers[-2]
            delta = position - prev_pos
            self.deltas.append(delta)
            
            # Update running stats
            n = len(self.deltas)
            old_mean = self.mean_delta
            self.mean_delta += (delta - old_mean) / n
            if n > 1:
                self.delta_variance += (delta - old_mean) * (delta - self.mean_delta)
    
    def get_expected_position(self):
        """Predict where the next turn should land based on beat pattern."""
        if len(self.turn_centers) < 2:
            return None
        
        last_pos, _ = self.turn_centers[-1]
        # Simple: project forward using mean delta
        return last_pos + int(self.mean_delta)
    
    def score_position_coherence(self, candidate_pos):
        """Score how well a candidate position continues the beat pattern.
        
        Returns value 0-1, higher = more coherent with conversation flow.
        """
        if len(self.turn_centers) < 2:
            return 0.5  # No pattern yet, neutral score
        
        expected = self.get_expected_position()
        if expected is None:
            return 0.5
        
        # How far is candidate from expected?
        deviation = abs(candidate_pos - expected)
        
        # Use variance to normalize
        n = len(self.deltas)
        std_dev = (self.delta_variance / n) ** 0.5 if n > 0 and self.delta_variance > 0 else 1000
        
        # Score: closer to expected = higher score
        # Using gaussian-like falloff
        if std_dev > 0:
            z_score = deviation / (std_dev + 1)
            coherence = 1.0 / (1.0 + z_score)
        else:
            coherence = 1.0 if deviation < 100 else 0.5
        
        return coherence
    
    def get_neighborhood(self, radius=500):
        """Get the region of corpus where conversation has been 'living'.
        
        Returns (min_pos, max_pos) bounding box around recent centers.
        """
        if not self.turn_centers:
            return None
        
        positions = [p for p, _ in self.turn_centers]
        center = positions[-1]  # Most recent
        
        # Expand around recent history
        recent = positions[-10:] if len(positions) >= 10 else positions
        min_pos = min(recent) - radius
        max_pos = max(recent) + radius
        
        return (max(0, min_pos), max_pos)
    
    def clear(self):
        """Reset context for new conversation."""
        self.turn_centers = []
        self.deltas = []
        self.mean_delta = 0
        self.delta_variance = 0
    
    def save(self, filepath):
        """Persist beat context to disk."""
        data = {
            'turn_centers': self.turn_centers,
            'deltas': self.deltas,
            'mean_delta': self.mean_delta,
            'delta_variance': self.delta_variance
        }
        with open(filepath, 'w') as f:
            json.dump(data, f)
    
    def load(self, filepath):
        """Load beat context from disk."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        self.turn_centers = [tuple(tc) for tc in data.get('turn_centers', [])]
        self.deltas = data.get('deltas', [])
        self.mean_delta = data.get('mean_delta', 0)
        self.delta_variance = data.get('delta_variance', 0)
    
    def score_with_recency(self, candidate_pos, decay=0.9):
        """Score position coherence with recency weighting.
        
        More recent turns matter more than distant ones.
        decay: weight multiplier per turn back (0.9 = 10% less per turn)
        """
        if len(self.turn_centers) < 2:
            return 0.5
        
        # Weight recent positions more heavily
        weighted_sum = 0
        weight_total = 0
        weight = 1.0
        
        # Go backwards from most recent
        for pos, ts in reversed(self.turn_centers[-10:]):
            distance = abs(candidate_pos - pos)
            # Closer to recent centers = better
            proximity = 1.0 / (1.0 + distance / 1000)
            weighted_sum += proximity * weight
            weight_total += weight
            weight *= decay
        
        return weighted_sum / weight_total if weight_total > 0 else 0.5
    
    def get_delta_pattern(self, n=10):
        """Get the last n deltas between turn centers."""
        if not self.deltas:
            return []
        return self.deltas[-n:]
    
    def stats(self):
        """Return context statistics."""
        n = len(self.deltas)
        std_dev = (self.delta_variance / n) ** 0.5 if n > 0 and self.delta_variance > 0 else 0
        return {
            'turns': len(self.turn_centers),
            'mean_delta': self.mean_delta,
            'std_dev': std_dev,
            'last_position': self.turn_centers[-1][0] if self.turn_centers else None,
            'expected_next': self.get_expected_position()
        }


class SynTree:
    """Minimal syntree for testing - just tracks IS_A hierarchy."""
    
    def __init__(self):
        self.tree = {}  # word -> {'parents': [], 'children': []}
    
    def build_from_relations(self, relations):
        """Extract IS_A relations."""
        count = 0
        for subj, rel_type, obj, pos, mods in relations.triples:
            if rel_type == 'IS_A' and obj:
                subj_lower = subj.lower()
                obj_lower = obj.lower()
                
                if subj_lower not in self.tree:
                    self.tree[subj_lower] = {'parents': [], 'children': []}
                if obj_lower not in self.tree:
                    self.tree[obj_lower] = {'parents': [], 'children': []}
                
                if obj_lower not in self.tree[subj_lower]['parents']:
                    self.tree[subj_lower]['parents'].append(obj_lower)
                if subj_lower not in self.tree[obj_lower]['children']:
                    self.tree[obj_lower]['children'].append(subj_lower)
                count += 1
        return count
    
    def get_closenyms(self, word, max_distance=2):
        """Get semantically close words with distances."""
        word = word.lower()
        if word not in self.tree:
            return [(word, 0, 'self')]
        
        results = [(word, 0, 'self')]
        visited = {word}
        
        # Distance 1: Parents + Children
        for parent in self.tree[word].get('parents', []):
            results.append((parent, 1.0, 'parent'))
            visited.add(parent)
        for child in self.tree[word].get('children', []):
            results.append((child, 1.0, 'child'))
            visited.add(child)
        
        if max_distance >= 2:
            # Distance 2: Siblings
            for parent in self.tree[word].get('parents', []):
                for sibling in self.tree[parent].get('children', []):
                    if sibling not in visited:
                        results.append((sibling, 2.0, 'sibling'))
                        visited.add(sibling)
        
        return results


class PositionHash:
    """The core: word positions + interference patterns."""
    
    def __init__(self):
        self.word_positions = defaultdict(list)  # word -> [pos1, pos2, ...]
        self.tokens = []  # the raw token stream
        self.total_tokens = 0
        self.synsets = Synsets()
        
        # Position-scoped overlay for surgical corrections
        # Format: {position: {"suppress": True} OR {"attract": pattern, "attract_strength": value}}
        self.overlay = {}
        self.last_interference = []  # positions from most recent query
        
        # ===== OPTIMIZATION: Separate indices for fast lookup =====
        # Instead of iterating all overlays, maintain separate lists for attractions/suppressions
        self.attracted_positions = set()  # Positions with attractions (for fast filtering)
        self.suppressed_positions = set()  # Positions that are suppressed (for fast filtering)
        self.attraction_map = {}  # query_normalized -> [(pos, strength), ...]  (for fast query lookup)
        
        # Position metadata: {pos: {'role': 'user'/'assistant', ...}}
        self.position_metadata = {}
        
        # World-building layer: directed predicate triples
        self.relations = Relations()
        
        # Beat-frequency context: tracks conversation flow
        self.beat_context = BeatContext()
        
        # Semantic tree: will be built separately if needed
        self.syntree = None
        
        # ===== CRITICAL ARCHITECTURE ADDITIONS =====
        # Position Stack Layer: ordinal precedence for corrections (blackjack deck model)
        self.position_stack = PositionStack()
        # Multiplier base for stack layers (effective strength = base ** layer)
        self.position_stack_multiplier_base = 2.0
        
        # Query Pattern Memory: learned query → expected_relations mappings
        self.query_patterns = QueryPatternMemory()
        self.query_patterns.relations = self.relations  # Link to relations for pattern extraction
        
        # Relational Generation System (new)
        self.relational_algebra = None  # Will be trained via train_algebra command
        self.relation_dict = None  # Will be initialized on first use
        self.relational_generator = None  # Will be created when needed
        self.synced_into_relation_dict = 0  # Track total relations synced for debugging

    def sync_relation_dict(self):
        """Ensure `self.relation_dict` is present and synced with `self.relations`.

        This avoids duplicated logic across `ingest()` and `query_relational()` and
        ensures the relational generator always sees the latest triples.
        """
        # Lazy initialization: create dict on first sync if it doesn't exist
        if self.relation_dict is None:
            try:
                from relational_generation import RelationDictionary
                self.relation_dict = RelationDictionary()
                print(f"DEBUG: Created RelationDictionary in sync_relation_dict()")
            except ImportError:
                return 0
        
        total_synced = 0
        # Start from the number of triples already present in the relation_dict
        existing = len(self.relation_dict.triples)
        total_relations = len(self.relations.triples)
        
        if existing < total_relations:
            print(f"DEBUG: sync_relation_dict: syncing relations {existing} to {total_relations}")
        
        for t in self.relations.triples[existing:]:
            try:
                subject, rel_type, obj, position, modifiers = t
            except Exception:
                continue
            if subject and rel_type and obj:
                self.relation_dict.add_relation(subject, rel_type, obj, position)
                total_synced += 1
        
        if total_synced > 0:
            print(f"DEBUG: Synced {total_synced} new relations into relation_dict (now has {len(self.relation_dict.triples)} total)")
            self.synced_into_relation_dict += total_synced
        
        return total_synced
    
    def ingest(self, text):
        """Tokenize and record positions of every word.
        Also extracts directed relations for world-building layer.
        """
        tokens = re.findall(r"[\w']+|[.,!?;:\"]", text.lower())
        start_pos = self.total_tokens
        
        for i, token in enumerate(tokens):
            pos = start_pos + i
            self.word_positions[token].append(pos)
            self.tokens.append(token)
        
        self.total_tokens = len(self.tokens)
        
        # Extract relations from this chunk
        # Split by sentence-ending punctuation for better extraction. We also
        # compute per-sentence start offset so the relations have correct
        # absolute positions in the corpus. Previously the same `start_pos`
        # was used for all sentences in a chunk causing misplaced relations.
        # Note: `re.split` will return sentences in order; we'll keep a
        # running token offset to assign per-sentence start positions.
        sentences = re.split(r'[.!?]', text.lower())
        before_rel_count = len(self.relations.triples)
        running_offset = 0
        for sentence in sentences:
            sentence_tokens = re.findall(r"[\w']+", sentence)
            if sentence_tokens:
                sentence_start_pos = start_pos + running_offset
                self.relations.extract_from_tokens(sentence_tokens, sentence_start_pos)
                running_offset += len(sentence_tokens)

        # If the relation dictionary exists, sync any newly extracted relations
        # that were just added during this ingest. This is critical for cases
        # where the generator (and relation_dict) was already initialized
        # and further ingests occur afterwards.
        if hasattr(self, 'sync_relation_dict'):
            # Use helper if available
            self.sync_relation_dict()
        elif hasattr(self, 'relation_dict') and self.relation_dict:
            new_triples = self.relations.triples[before_rel_count:]
            if new_triples:
                batch = []
                for t in new_triples:
                    try:
                        subject, rel_type, obj, position, modifiers = t
                    except Exception:
                        continue
                    if subject and rel_type and obj:
                        batch.append((subject, rel_type, obj, position))
                if batch:
                    try:
                        self.relation_dict.add_relations_batch(batch)
                    except Exception:
                        for subj, pred, obj, pos in batch:
                            self.relation_dict.add_relation(subj, pred, obj, pos)
        
        return len(tokens)

    def get_relations_in_segment(self, start_pos, length):
        """Return relation triples within [start_pos, start_pos+length).

        Uses synced `relation_dict` if available, else falls back to
        `self.relations.triples`.
        """
        source = getattr(self, 'relation_dict', None) or getattr(self, 'relations', None)
        if source is None:
            return []

        triples = getattr(source, 'triples', [])
        res = []
        try:
            s = int(start_pos)
            e = int(start_pos) + int(length)
        except Exception:
            return []

        for t in triples:
            try:
                pos = int(t[3])
            except Exception:
                continue
            if pos >= s and pos < e:
                res.append(t)
        return res

    def extract_relations_from_range(self, start_pos, end_pos):
        """Ensure relations are extracted for tokens in [start_pos, end_pos).

        If relations are already present in that range, return them. Otherwise,
        attempt to extract relations by running the extractor on the token
        slice and return the relations found for that range.
        """
        # First, gather any existing relations in the range from both
        # relation_dict (if present) and raw relations storage.
        existing = []
        existing.extend(getattr(self, 'get_relations_in_segment', lambda s, l: [])(start_pos, max(0, end_pos - start_pos)))
        # Also check raw relations list in case relation_dict hasn't been populated
        for t in getattr(self.relations, 'triples', []):
            try:
                pos = int(t[3])
            except Exception:
                continue
            if pos >= int(start_pos) and pos < int(end_pos):
                existing.append(t)

        if existing:
            return existing

        # If none exist, try extracting from the token slice
        try:
            s = int(start_pos)
            e = int(end_pos)
        except Exception:
            return []

        tokens_slice = self.tokens[s:e]
        if not tokens_slice:
            return []

        # Use relations extractor to add any new relations; extractor expects
        # tokens and a start position
        try:
            self.relations.extract_from_tokens(tokens_slice, s)
        except Exception:
            # Extraction failed; return whatever existing relations we can find
            return self.get_relations_in_segment(start_pos, max(0, end_pos - start_pos))

        # Sync into relation_dict if present
        if hasattr(self, 'sync_relation_dict') and getattr(self, 'relation_dict', None):
            try:
                self.sync_relation_dict()
            except Exception:
                pass

        return self.get_relations_in_segment(start_pos, max(0, end_pos - start_pos))
    
    def ingest_file(self, filepath):
        """Load a text file."""
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return self.ingest(f.read())
    
    def ingest_directory(self, dirpath):
        """Load all text files from a directory recursively."""
        total = 0
        files = glob.glob(os.path.join(dirpath, "**", "*.txt"), recursive=True)
        for fpath in files:
            total += self.ingest_file(fpath)
        return total
    
    def ingest_json_conversations(self, filepath):
        """Load from ChatGPT-style JSON export with conversational replay.
        
        IMPORTANT: This replays conversations as sequences, not flat text.
        Respects turn structure to apply negations/corrections in real-time.
        """
        import sys
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        total = 0
        start_time = time.time()
        last_report = start_time
        
        if isinstance(data, list):
            num_convos = len(data)
            total_corrections = 0
            total_negations = 0
            
            for i, convo in enumerate(data):
                # REPLAY this conversation as a sequence
                total_in_convo, corrections, negations = self._replay_conversation(convo)
                total += total_in_convo
                total_corrections += corrections
                total_negations += negations
                
                # Progress report every 0.5 seconds or every 50 conversations
                elapsed = time.time() - start_time
                if elapsed > 0 and (time.time() - last_report > 0.5 or (i + 1) % 50 == 0):
                    rate = total / elapsed
                    percent = ((i + 1) / num_convos) * 100
                    rate_text = f"{rate:,.0f} tokens/sec"
                    sys.stdout.write(f"\r  [{i+1:,}/{num_convos:,} convos] {total:,} tokens @ {rate_text} ({percent:.1f}%)")
                    if total_corrections > 0 or total_negations > 0:
                        sys.stdout.write(f" [corrections:{total_corrections} negations:{total_negations}]")
                    sys.stdout.flush()
                    last_report = time.time()
            
            # Final summary
            sys.stdout.write(f"\n")
            if total_corrections > 0 or total_negations > 0:
                sys.stdout.write(f"  → Detected {total_corrections} corrections, {total_negations} negations\n")
                sys.stdout.flush()
        
        return total
    
    def _replay_conversation(self, convo):
        """Replay a single conversation with conversational awareness.
        
        Returns: (tokens_ingested, corrections_applied, negations_created)
        """
        mapping = convo.get('mapping', {})
        if not mapping:
            return 0, 0, 0
        
        total = 0
        corrections = 0
        negations = 0
        
        # Extract turn order from mapping
        # ChatGPT stores messages in a tree; we need to linearize them
        turns = self._extract_turn_sequence(mapping)
        
        last_user_positions = []
        last_assistant_positions = []
        
        for turn_idx, turn in enumerate(turns):
            node = turn
            msg = node.get('message')
            if not msg or not msg.get('content') or not msg['content'].get('parts'):
                continue
            
            text = " ".join([str(p) for p in msg['content']['parts']])
            if not text.strip():
                continue
            
            role = msg.get('author', {}).get('role', 'unknown')
            
            # Record positions before ingestion
            start_pos = self.total_tokens
            token_count = self.ingest(text)
            end_pos = self.total_tokens
            positions_ingested = list(range(start_pos, end_pos))
            total += token_count
            
            # CONVERSATIONAL LOGIC: Apply corrections/negations in context
            if role == 'user':
                # User turn: check for negations/corrections of previous assistant message
                negation_markers = {'no', 'not', 'wrong', 'actually', 'really', 'never', "don't", "doesn't", "didn't"}
                text_tokens = set(text.lower().split())
                
                has_negation = any(marker in text_tokens for marker in negation_markers)
                
                if has_negation and last_assistant_positions:
                    # User is negating/correcting the assistant's last response
                    self.relations.extract_negation_links(start_pos, last_assistant_positions)
                    negations += 1
                    corrections += 1
                
                last_user_positions = positions_ingested
            
            elif role == 'assistant':
                # Assistant turn: track for potential correction in next user turn
                last_assistant_positions = positions_ingested
        
        return total, corrections, negations
    
    def _extract_turn_sequence(self, mapping):
        """Extract linear turn sequence from ChatGPT's tree-structured mapping.
        
        ChatGPT messages are stored in a DAG; this linearizes them by following
        parent/child relationships.
        """
        if not mapping:
            return []
        
        # Find root node (parent_id == None)
        root_id = None
        for node_id, node in mapping.items():
            if node.get('parent') is None:
                root_id = node_id
                break
        
        if not root_id:
            # Fallback: just process in order
            return list(mapping.values())
        
        # Traverse tree depth-first to get linear sequence
        sequence = []
        visited = set()
        
        def traverse(node_id):
            if node_id in visited or node_id not in mapping:
                return
            visited.add(node_id)
            
            node = mapping[node_id]
            sequence.append(node)
            
            # Find children
            for potential_child_id, potential_child in mapping.items():
                if potential_child.get('parent') == node_id:
                    traverse(potential_child_id)
        
        traverse(root_id)
        return sequence
    
    def ingest_reflex_export(self, filepath):
        """Load from Reflex Engine JSON export (reflex-session-*.json) with progress."""
        import sys
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        total = 0
        start_time = time.time()
        last_report = start_time
        
        # Handle different reflex formats
        if isinstance(data, dict):
            all_items = []
            
            # Collect all items from various keys
            messages = data.get('messages', [])
            if messages:
                all_items.extend(messages)
            
            turns = data.get('turns', []) or data.get('conversation', [])
            if turns:
                all_items.extend(turns)
            
            for i, item in enumerate(all_items):
                if isinstance(item, dict):
                    for key in ['content', 'text', 'message', 'user', 'assistant', 'input', 'output', 'prompt', 'response']:
                        if key in item and item[key]:
                            total += self.ingest(str(item[key]))
                elif isinstance(item, str):
                    total += self.ingest(item)
                
                # Progress report every 0.5 seconds
                elapsed = time.time() - start_time
                if elapsed > 0 and time.time() - last_report > 0.5:
                    rate = total / elapsed
                    sys.stdout.write(f"\r  [{i+1:,} items] {total:,} tokens @ {rate:,.0f} tokens/sec")
                    sys.stdout.flush()
                    last_report = time.time()
            
            # Check for context/memory
            for key in ['context', 'memory', 'history', 'state']:
                if key in data and data[key]:
                    if isinstance(data[key], str):
                        total += self.ingest(data[key])
                    elif isinstance(data[key], list):
                        for item in data[key]:
                            if isinstance(item, str):
                                total += self.ingest(item)
        
        elif isinstance(data, list):
            # Array of messages or turns
            for i, item in enumerate(data):
                if isinstance(item, dict):
                    for key in ['content', 'text', 'message', 'user', 'assistant']:
                        if key in item and item[key]:
                            total += self.ingest(str(item[key]))
                elif isinstance(item, str):
                    total += self.ingest(item)
                
                # Progress report every 0.5 seconds
                elapsed = time.time() - start_time
                if elapsed > 0 and time.time() - last_report > 0.5:
                    rate = total / elapsed
                    sys.stdout.write(f"\r  [{i+1:,} items] {total:,} tokens @ {rate:,.0f} tokens/sec")
                    sys.stdout.flush()
                    last_report = time.time()
        
        return total
    
    def ingest_google_qa(self, filepath):
        """Load from Google QA pair format with progress tracking."""
        import sys
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        total = 0
        start_time = time.time()
        last_report = start_time
        
        if isinstance(data, list):
            for i, item in enumerate(data):
                if isinstance(item, dict):
                    # Common QA formats
                    q = item.get('question', '') or item.get('q', '') or item.get('input', '') or item.get('prompt', '')
                    a = item.get('answer', '') or item.get('a', '') or item.get('output', '') or item.get('response', '')
                    
                    if q:
                        total += self.ingest(str(q))
                    if a:
                        total += self.ingest(str(a))
                    
                    # Also check for context
                    ctx = item.get('context', '') or item.get('passage', '')
                    if ctx:
                        total += self.ingest(str(ctx))
                
                # Progress report every 0.5 seconds
                elapsed = time.time() - start_time
                if elapsed > 0 and time.time() - last_report > 0.5:
                    rate = total / elapsed
                    sys.stdout.write(f"\r  [{i+1:,} pairs] {total:,} tokens @ {rate:,.0f} tokens/sec")
                    sys.stdout.flush()
                    last_report = time.time()
        
        elif isinstance(data, dict):
            # Single QA or nested format
            items_list = []
            for key in ['questions', 'qa_pairs', 'data', 'examples']:
                if key in data and isinstance(data[key], list):
                    items_list.extend(data[key])
            
            for i, item in enumerate(items_list):
                if isinstance(item, dict):
                    q = item.get('question', '') or item.get('q', '')
                    a = item.get('answer', '') or item.get('a', '')
                    if q:
                        total += self.ingest(str(q))
                    if a:
                        total += self.ingest(str(a))
                
                # Progress report every 0.5 seconds
                elapsed = time.time() - start_time
                if elapsed > 0 and time.time() - last_report > 0.5:
                    rate = total / elapsed
                    sys.stdout.write(f"\r  [{i+1:,} pairs] {total:,} tokens @ {rate:,.0f} tokens/sec")
                    sys.stdout.flush()
                    last_report = time.time()
        
        return total
    
    def ingest_json_auto(self, filepath):
        """Auto-detect JSON format and ingest appropriately."""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Detect format by looking at structure
        filename = os.path.basename(filepath).lower()
        
        # Reflex format detection
        if 'reflex' in filename or filename.startswith('reflex-session'):
            return self.ingest_reflex_export(filepath)
        
        # ChatGPT format detection (has 'mapping' with nested messages)
        if isinstance(data, list) and len(data) > 0:
            first = data[0]
            if isinstance(first, dict) and 'mapping' in first:
                return self.ingest_json_conversations(filepath)
        
        # QA pair detection
        if isinstance(data, list) and len(data) > 0:
            first = data[0]
            if isinstance(first, dict) and ('question' in first or 'q' in first or 'answer' in first):
                return self.ingest_google_qa(filepath)
        
        # Generic fallback - try reflex format (handles most structures)
        return self.ingest_reflex_export(filepath)

    def get_positions(self, word, use_synsets=True):
        """Get all positions of a word, optionally expanding via synsets.
        Respects overlay suppressions - suppressed positions are invisible."""
        word = word.lower()
        
        if use_synsets:
            # Get all synonyms and union their positions
            synonyms = self.synsets.get_synonyms(word)
            all_positions = []
            for syn in synonyms:
                all_positions.extend(self.word_positions.get(syn, []))
            positions = sorted(set(all_positions))
        else:
            positions = self.word_positions.get(word, [])
        
        # Apply overlay suppressions
        if self.overlay:
            positions = [p for p in positions 
                        if p not in self.overlay or not self.overlay[p].get('suppress')]
        
        return positions

    def layer_multiplier(self, pos: int) -> float:
        """Return multiplicative boost for a position based on its stack layer."""
        try:
            layer = self.position_stack.get_layer(pos)
            if layer and layer > 0:
                return float(self.position_stack_multiplier_base) ** float(layer)
        except Exception:
            pass
        return 1.0
    
    def _parse_relation(self, query):
        """
        Parse query into relational structure.
        
        Returns dict with:
        - type: 'QUERY', 'STATEMENT', 'COMMAND'
        - question: question word if present (what, who, where, etc)
        - verb: main verb (is, are, has, does, etc)
        - subject: main noun/entity (usually first content word)
        - object: secondary entity
        
        Examples:
        - "what is a dog" → {type: QUERY, question: what, verb: is, subject: dog}
        - "a dog is" → {type: QUERY, question: None, verb: is, subject: dog}
        - "dog is animal" → {type: STATEMENT, verb: is, subject: dog, object: animal}
        """
        words = query.lower().split()
        
        structure = {
            'type': None,
            'question': None,
            'verb': None,
            'subject': None,
            'object': None,
            'raw_words': words
        }
        
        if not words:
            return structure
        
        # Detect question words
        question_words = {'what', 'who', 'where', 'when', 'why', 'how', 'which', 'whose'}
        if words[0] in question_words:
            structure['question'] = words[0]
            structure['type'] = 'QUERY'
        else:
            structure['type'] = 'STATEMENT'
        
        # Find main verb
        verbs = {'is', 'are', 'was', 'were', 'be', 'been', 'being',
                 'has', 'have', 'had', 'does', 'do', 'did',
                 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must',
                 'goes', 'go', 'comes', 'come', 'makes', 'make'}
        
        verb_pos = None
        for i, word in enumerate(words):
            if word in verbs:
                structure['verb'] = word
                verb_pos = i
                break
        
        # Extract subject and object (skip determiners and question words)
        skip_words = {'what', 'who', 'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be'}
        content_words = [(i, w) for i, w in enumerate(words) 
                        if w not in skip_words and len(w) > 1]
        
        if content_words:
            # Subject is usually first content word
            subject_idx, structure['subject'] = content_words[0]
            
            # Object is usually second content word (especially after verb)
            if len(content_words) > 1:
                _, structure['object'] = content_words[1]
        
        return structure
    
    def relational_interference(self, query, window=15):
        """
        Find positions using relational structure instead of word proximity.
        
        Key insight: We're not searching for words, we're searching for RELATIONS.
        
        For query "what is a dog":
        - Parse into: QUERY type, subject=dog, verb=is
        - Look up in syntree: dog IS_A ???
        - Score positions where these relations exist
        
        Returns list of (position, score) tuples, highest scored first.
        """
        # ===== ATTRACTION PASS: Check for semantic magnets first (OPTIMIZED) =====
        # Fast lookup using pre-indexed attraction map instead of O(n) iteration
        # NOTE: Attraction matches should apply even if the syntree isn't built
        # (they're user-provided corrections / magnets that should be honored
        # unconditionally). So perform attraction lookup before falling back.
        query_normalized = re.sub(r'[^\w\s]', '', query.lower()).strip()
        attraction_hits = []
        
        # First try exact match in attraction_map (O(1) lookup)
        if query_normalized in self.attraction_map:
            for entry in self.attraction_map[query_normalized]:
                # entries may be (pos, strength) or (pos, strength, timestamp)
                try:
                    pos = entry[0]
                    strength = float(entry[1])
                except Exception:
                    # Fallback: skip malformed entry
                    continue
                base_score = 0.5  # Moderate base
                layer_number = self.position_stack.get_layer(pos)
                if layer_number > 0:
                    base_score = base_score * (1.0 + layer_number * 10.0)
                score = base_score * strength
                attraction_hits.append((pos, score))
        
        # If no exact match, check for substring matches (only if needed)
        if not attraction_hits and self.attracted_positions:
            # Only iterate through attracted positions, not all overlays
            for pos in self.attracted_positions:
                if pos in self.overlay and 'attract' in self.overlay[pos]:
                    attract_pattern = self.overlay[pos]['attract']
                    attract_normalized = re.sub(r'[^\w\s]', '', attract_pattern).lower()
                    
                    # Check if query matches attraction pattern
                    if query_normalized in attract_normalized or attract_normalized in query_normalized:
                        strength = self.overlay[pos].get('attract_strength', 1000.0)
                        base_score = 0.5  # Moderate base
                        layer_number = self.position_stack.get_layer(pos)
                        if layer_number > 0:
                            base_score = base_score * (1.0 + layer_number * 10.0)
                        score = base_score * strength
                        attraction_hits.append((pos, score))
        
        # If we found attractions that match, return them at the top
        if attraction_hits:
            attraction_hits.sort(key=lambda x: -x[1])
            return attraction_hits

        # If syntree isn't available, fall back to word-based interference
        # AFTER checking attractions above. This ensures attracted positions
        # are respected even when syntree hasn't been built.
        if not self.syntree:
            words = re.findall(r"[\w']+", query.lower())
            return self.interference(words, window)

        # Parse query into relation
        rel = self._parse_relation(query)
        
        if not rel['subject']:
            # No subject found, fall back to word interference
            words = re.findall(r"[\w']+", query.lower())
            return self.interference(words, window)
        
        subject = rel['subject'].lower()
        position_scores = defaultdict(float)
        
        # ===== SUBSET 1: Core relation (verb + subject) =====
        if rel['verb'] and rel['subject']:
            core_words = [rel['verb'], rel['subject']]
            core_hits = self.interference(core_words, window=5)  # Tight window for core
            
            for pos, score in core_hits:
                # Core relation is most important: 5x weight
                position_scores[pos] += score * 5.0
        
        # ===== SUBSET 2: Syntree relations =====
        # Use the syntree to find positions where SEMANTIC relations exist
        if subject in self.syntree.tree:
            tree_node = self.syntree.tree[subject]
            
            # Get all IS_A relations for this subject
            for parent in tree_node.get('parents', []):
                # For each IS_A relation, find positions where it appears
                for triple in self.relations.triples:
                    subj, rel_type, obj, pos, mods = triple
                    if (subj.lower() == subject and 
                        rel_type == 'IS_A' and 
                        obj and 
                        obj.lower() == parent):
                        # This triple is a relation we care about
                        # Score it: relations are MOST important (10x weight)
                        position_scores[pos] += 10.0
                        
                        # Also check if subject word is nearby
                        subject_positions = self.get_positions(subject, use_synsets=False)
                        if subject_positions:
                            # Find closest subject position to this relation position
                            closest_distance = min(abs(pos - sp) for sp in subject_positions)
                            if closest_distance <= window:
                                # Subject is nearby: boost score further
                                proximity_bonus = 1.0 / (1.0 + closest_distance / 5.0)
                                position_scores[pos] += proximity_bonus * 5.0
        
        # ===== SUBSET 3: Question context =====
        # If this is a question, boost positions near question words
        if rel['question']:
            question_positions = self.get_positions(rel['question'], use_synsets=False)
            
            if question_positions:
                # Score positions by proximity to question word
                subject_positions = self.get_positions(subject, use_synsets=False)
                
                for sp in subject_positions:
                    min_dist = min(abs(sp - qp) for qp in question_positions)
                    if min_dist <= window:
                        # Question is nearby: boost score (1x weight, context only)
                        proximity_bonus = 1.0 / (1.0 + min_dist / 10.0)
                        position_scores[sp] += proximity_bonus * 1.0
        
        # ===== FALLBACK: If no relation-based hits, use word interference =====
        if not position_scores:
            words = [w for w in [rel['verb'], rel['subject'], rel['object']] if w]
            return self.interference(words, window)
        
        # ===== APPLY META-SCORING (negations, corrections) =====
        for pos in position_scores:
            # Skip suppressed positions
            if pos in self.overlay and self.overlay[pos].get('suppress'):
                position_scores[pos] = 0.0
                continue
            
            meta_mult = self.get_meta_score(pos)
            position_scores[pos] *= meta_mult
        
        # Filter out suppressed positions (score 0)
        position_scores = {pos: score for pos, score in position_scores.items() if score > 0}
        
        # If all positions suppressed, fall back to word-based
        if not position_scores:
            words = [w for w in [rel['verb'], rel['subject'], rel['object']] if w]
            return self.interference(words, window)
        
        # Convert to sorted list
        results = sorted(position_scores.items(), key=lambda x: -x[1])
        
        return results
    
    def interference(self, words, window=15, use_synsets=True, use_beat_context=False):
        """
        Find where ALL words appear within a window.
        Returns list of (position, score) tuples.
        
        Args:
            words: List of words to find interference for
            window: Token window for interference detection
            use_synsets: Whether to expand via synsets
            use_beat_context: ONLY True during active chat sessions (filters by conversation neighborhood)
        """
        if not words:
            return []
        
        words = [w.lower() for w in words]
        query_normalized = ' '.join(words).lower()
        
        # Get positions for each word (with optional synset expansion)
        word_pos_sets = []
        for word in words:
            positions = self.get_positions(word, use_synsets=use_synsets)
            if not positions:
                return []  # One word has no positions, no interference possible
            word_pos_sets.append(set(positions))
        
        # Find interference: positions where all words are within window
        # Use the smallest set as anchor
        anchor_idx = min(range(len(word_pos_sets)), key=lambda i: len(word_pos_sets[i]))
        anchor_positions = word_pos_sets[anchor_idx]
        other_sets = [s for i, s in enumerate(word_pos_sets) if i != anchor_idx]
        
        # ONLY apply beat context filtering if explicitly requested (chat mode only)
        if use_beat_context:
            neighborhood = self.beat_context.get_neighborhood(radius=2000)
            if neighborhood:
                min_bound, max_bound = neighborhood
                # Filter anchor to neighborhood first (performance + context)
                anchor_positions = {p for p in anchor_positions if min_bound <= p <= max_bound}
        
        hits = []
        
        # ===== FIRST PASS: Check for ATTRACTION overlays (SEMANTIC WORD OVERLAP) =====
        query_normalized_clean = re.sub(r'[^\w\s]', '', query_normalized).lower()
        query_words = set(query_normalized_clean.split())
        
        # Filter out function words from query for matching
        function_words = {'what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 
                         'was', 'were', 'a', 'an', 'the', 'do', 'does', 'did', 'can',
                         'could', 'will', 'would', 'should', 'may', 'might', 'must',
                         'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from'}
        query_content_words = set(w for w in query_words if w not in function_words and len(w) > 2)
        
        # If query is all function words, use the whole query
        if not query_content_words:
            query_content_words = query_words
        
        # Try exact match first (O(1))
        if query_normalized_clean in self.attraction_map:
            for entry in self.attraction_map[query_normalized_clean]:
                pos = entry[0]
                strength = entry[1] if len(entry) > 1 else 1000.0
                
                base_score = 0.5
                layer_number = self.position_stack.get_layer(pos)
                if layer_number > 0:
                    base_score = base_score * (1.0 + layer_number * 10.0)
                score = base_score * strength
                hits.append((pos, score))
        
        # If no exact match, check for SEMANTIC WORD OVERLAP (not substring!)
        if not hits and self.attracted_positions:
            for pos in self.attracted_positions:
                if pos not in self.overlay or 'attract' not in self.overlay[pos]:
                    continue
                
                overlay_data = self.overlay[pos]
                
                # Get content words from attraction (use cached if available)
                if 'attract_content_words' in overlay_data:
                    attract_content_words = set(overlay_data['attract_content_words'])
                else:
                    attract_pattern = overlay_data['attract']
                    attract_normalized = re.sub(r'[^\w\s]', '', attract_pattern).lower()
                    attract_content_words = set(w for w in attract_normalized.split() 
                                               if w not in function_words and len(w) > 2)
                    if not attract_content_words:
                        attract_content_words = set(attract_normalized.split())
                
                # Calculate WORD OVERLAP
                if not attract_content_words or not query_content_words:
                    continue
                
                overlap = len(query_content_words & attract_content_words)
                min_set_size = min(len(query_content_words), len(attract_content_words))
                overlap_ratio = overlap / min_set_size if min_set_size > 0 else 0
                
                # Require at least 50% overlap of the SMALLER set
                if overlap_ratio >= 0.5:
                    strength = overlay_data.get('attract_strength', 1000.0)
                    
                    # Scale strength by overlap quality
                    adjusted_strength = strength * overlap_ratio
                    
                    base_score = 0.5
                    layer_number = self.position_stack.get_layer(pos)
                    if layer_number > 0:
                        base_score = base_score * (1.0 + layer_number * 10.0)
                    
                    score = base_score * adjusted_strength
                    hits.append((pos, score))
        
        # ===== SECOND PASS: Normal window-based interference =====
        attraction_positions = {h[0] for h in hits}  # Fast set for O(1) lookup
        
        for pos in anchor_positions:
            # Skip suppressed positions (fast check)
            if pos in self.suppressed_positions:
                continue
            
            # Skip if already added via attraction (avoid duplicates)
            if pos in attraction_positions:
                continue
            
            # Check if all other words have a position within window
            all_match = True
            total_distance = 0
            
            for other_set in other_sets:
                found = False
                for offset in range(-window, window + 1):
                    if (pos + offset) in other_set:
                        total_distance += abs(offset)
                        found = True
                        break
                if not found:
                    all_match = False
                    break
            
            if all_match:
                # Score: closer = better (invert distance)
                base_score = 1.0 / (1.0 + total_distance / len(words))
                
                # ===== CRITICAL LAYER PRECEDENCE SCORING =====
                # Apply position stack layer scoring (corrections boost precedence)
                layer_number = self.position_stack.get_layer(pos)
                if layer_number > 0:
                    # Exponential boost: layer 1 = 10x, layer 2 = 20x, etc.
                    base_score = base_score * (1.0 + layer_number * 10.0)
                
                # ONLY apply beat biasing if explicitly requested (chat mode only)
                if use_beat_context:

                    # Apply beat-frequency context bias
                    # Boost positions that continue the established rhythm
                    beat_bias = self.beat_context.score_position_coherence(pos)
                    
                    # Also consider recency - staying near recent conversation
                    recency_bias = self.beat_context.score_with_recency(pos)
                    
                    # Combined: base quality + layer precedence + rhythm coherence + proximity to recent
                    score = base_score * (1.0 + beat_bias * 0.3 + recency_bias * 0.2)
                else:
                    score = base_score
                
                hits.append((pos, score))
        
        # Sort by score (best first)
        hits.sort(key=lambda x: -x[1])
        return hits
    
    def context_at(self, position, radius=10):
        """Get tokens around a position."""
        start = max(0, position - radius)
        end = min(len(self.tokens), position + radius + 1)
        return self.tokens[start:end]
    
    def generate_from(self, position, length=30):
        """Walk forward from a position, starting from sentence boundary.
        Returns tuple: (tokens, actual_positions_used)"""
        # Find the nearest sentence boundary before this position
        # Look back for period, question mark, exclamation mark, newline
        sentence_markers = {'.', '?', '!', '\n'}
        start_pos = position
        
        # Backtrack up to 20 tokens to find sentence start
        for i in range(max(0, position - 20), position):
            if self.tokens[i] in sentence_markers:
                # Found a boundary, start after it
                start_pos = i + 1
                break
        
        # Grab from aligned start position
        end = min(len(self.tokens), start_pos + length)
        result = self.tokens[start_pos:end]
        actual_positions = list(range(start_pos, end))
        
        # But if we backed up too far, ensure we still include original position
        if start_pos > position:
            # Backtrack went too far, just start at position
            end = min(len(self.tokens), position + length)
            result = self.tokens[position:end]
            actual_positions = list(range(position, end))
        
        return result, actual_positions
    
    def query(self, prompt, length=30, window=20, use_synsets=True, use_relations=True, in_chat_mode=False):
        """
        Main query interface with RELATIONAL INTERFERENCE.
        
        TWO-TIER STRATEGY:
        1. Try relational_interference (syntree-based, relation pattern matching)
        2. Fall back to word-based interference if no relational hits
        
        Args:
            prompt: User's query text
            length: Max tokens to generate
            window: Interference window size
            use_synsets: Whether to expand query via synsets (word-based fallback)
            use_relations: Whether to use relation-based interference AND generation
            in_chat_mode: Set True when in interactive chat to enable beat context filtering
        """
        words = re.findall(r"[\w']+", prompt.lower())
        if not words:
            return None
        
        # Build trace: which words matched and their position counts
        trace = []
        for word in words:
            positions = self.get_positions(word, use_synsets=use_synsets)
            synonyms = self.synsets.get_synonyms(word) if use_synsets else {word}
            trace.append({
                'word': word,
                'synonyms': list(synonyms),
                'positions': len(positions),
                'expanded': len(synonyms) > 1
            })
        
        # ===== PHASE 1: TRY RELATIONAL INTERFERENCE =====
        hits = []
        interference_method = 'word-based'
        
        if use_relations and self.syntree and self.relations.triples:
            # Try relational interference first (relation pattern matching)
            hits = self.relational_interference(prompt, window=window)
            if hits:
                interference_method = 'relational'
        
        # ===== PHASE 2: FALLBACK TO WORD-BASED INTERFERENCE =====
        if not hits:
            hits = self.interference(words, window=window, use_synsets=use_synsets, use_beat_context=in_chat_mode)
            interference_method = 'word-based'
        
        if not hits:
            # Final fallback: find just the last word
            positions = self.get_positions(words[-1], use_synsets=False)
            if positions:
                # Pick middle occurrence
                hits = [(positions[len(positions)//2], 0.5)]
                interference_method = 'final-fallback'
        
        if not hits:
            self.last_interference = []
            return None
        
        # Track interference positions for potential correction
        self.last_interference = [pos for pos, _ in hits[:10]]
        
        # --- Apply learned query patterns (if any) by boosting positions where
        # relations in the learned pattern exist. This biases the interference
        # hit list toward positions actually containing the corrected relation.
        try:
            learned_pattern = self.query_patterns.get_expected_patterns(prompt)
            if learned_pattern and 'relation_triples' in learned_pattern and learned_pattern['relation_triples']:
                # Build a set of positions matching any relation template
                pattern_positions = set()
                for subj, pred, obj in learned_pattern['relation_triples']:
                    subj = subj.lower() if subj else None
                    obj = obj.lower() if obj else None
                    pred = pred.upper() if pred else None
                    # Scan stored triples for matches
                    for s, r, o, p, mods in self.relations.triples:
                        if subj and subj != s:
                            continue
                        if obj and obj != o:
                            continue
                        if pred and pred != r:
                            continue
                        pattern_positions.add(p)

                if pattern_positions:
                    # Increase score for matched positions (or add them if missing)
                    hits_map = {pos: score for pos, score in hits}
                    # Apply layer multipliers to existing hit scores
                    for pos in list(hits_map.keys()):
                        hits_map[pos] = hits_map[pos] * self.layer_multiplier(pos)
                    max_existing = max([s for _, s in hits], default=0)
                    for p in pattern_positions:
                        if p in hits_map:
                            hits_map[p] = (hits_map[p] + max(5.0, 0.1 * max_existing)) * self.layer_multiplier(p)
                        else:
                            hits_map[p] = (max_existing + 10.0) * self.layer_multiplier(p)
                    # Rebuild hits sorted by score
                    hits = sorted(hits_map.items(), key=lambda x: -x[1])
                    # Update last_interference to reflect pattern influence
                    self.last_interference = [pos for pos, _ in hits[:10]]
        except Exception:
            pass

        # Use best hit
        best_pos, score = hits[0]
        
        # Generate response
        if use_relations and self.relations.triples:
            generated, relation_trace = self.generate_with_relations(words, hits, length)
            # Track actual generated positions (not implemented for relations yet)
            self.last_interference = [pos for pos, _ in hits[:10]]
        else:
            generated, actual_positions = self.generate_from(best_pos, length)
            # Track ACTUAL token positions that were generated
            self.last_interference = actual_positions
            relation_trace = []
        
        # Record this turn's center for beat-frequency context
        self.beat_context.add_turn(best_pos)
        
        return {
            'hits': len(hits),
            'position': best_pos,
            'score': score,
            'context': ' '.join(self.context_at(best_pos, 10)),
            'generated': ' '.join(generated) if isinstance(generated, list) else generated,
            'trace': trace,
            'relations_used': relation_trace,
            'positions_used': self.last_interference,
            'interference_method': interference_method  # NEW: Track which method was used
        }
    
    def query_relational(self, prompt: str, length: int = 50) -> Dict:
        """
        Query using the new RelationallyGuidedGenerator system.
        
        This uses relational composition instead of linear playback:
        1. Find interference positions
        2. Extract relations at those positions
        3. Expand via relational algebra
        4. Compose response from relation graph
        
        Args:
            prompt: User's query text
            length: Max tokens to generate
        
        Returns:
            Result dict with 'generated' key containing response
        """
        print(f"DEBUG: query_relational called with prompt='{prompt}'")
        
        # Initialize relational system on first use (lazy initialization, but then persistent)
        if self.relation_dict is None or self.relational_generator is None:
            print(f"DEBUG: Initializing relational system (relation_dict={self.relation_dict is not None}, generator={self.relational_generator is not None})")
            try:
                from relational_generation import RelationDictionary, RelationallyGuidedGenerator
                
                # Create relation dictionary if needed
                if self.relation_dict is None:
                    self.relation_dict = RelationDictionary()
                    print(f"DEBUG: Created RelationDictionary")
                    
                    # Sync all extracted relations into the dict
                    print(f"DEBUG: Syncing {len(self.relations.triples)} relations...")
                    synced_count = 0
                    skipped_count = 0
                    for triple in self.relations.triples:
                        subject, rel_type, obj, position, modifiers = triple
                        # Skip relations with None/invalid values
                        if subject is None or rel_type is None or obj is None:
                            skipped_count += 1
                            continue
                        self.relation_dict.add_relation(subject, rel_type, obj, position)
                        synced_count += 1
                    
                    print(f"DEBUG: Synced {synced_count} relations (skipped {skipped_count}). relation_dict has {len(self.relation_dict.by_position)} positions")
                
                # Create generator if needed
                if self.relational_generator is None:
                    self.relational_generator = RelationallyGuidedGenerator(
                        position_hash=self,
                        relation_dict=self.relation_dict,
                        algebra=self.relational_algebra  # May be None, that's OK
                    )
                    print(f"DEBUG: Created RelationallyGuidedGenerator")
            except Exception as e:
                print(f"DEBUG: Exception during relational system initialization: {e}")
                import traceback
                traceback.print_exc()
                # Fallback to regular query if relational system unavailable
                return self.query(prompt, length=length, use_relations=False)
        
        # Parse query
        words = re.findall(r"[\w']+", prompt.lower())
        print(f"DEBUG: Query words: {words}")
        if not words:
            return None

        # (cleanup) Previously considered auto-ingesting definitional prompts here;
        # we avoid doing that automatically to prevent spurious state changes
        # during training. Fallback behaviours are handled in the generator.
        # Ensure relation_dict is fully synced with the engine's relations.
        # This catches cases where relation_dict was initialized earlier but
        # new relations were added afterwards (defensive check).
        synced_count = 0
        if hasattr(self, 'sync_relation_dict') and self.relation_dict:
            synced_count = self.sync_relation_dict()
            print(f"DEBUG: sync_relation_dict returned {synced_count} new relations")
        elif self.relation_dict and len(self.relation_dict.triples) < len(self.relations.triples):
            print(f"DEBUG: relation_dict has {len(self.relation_dict.triples)} triples; syncing new relations up to {len(self.relations.triples)}...")
            synced_count = 0
            for t in self.relations.triples[len(self.relation_dict.triples):]:
                try:
                    subject, rel_type, obj, position, modifiers = t
                except Exception:
                    continue
                if subject and rel_type and obj:
                    self.relation_dict.add_relation(subject, rel_type, obj, position)
                    synced_count += 1
            print(f"DEBUG: Synced {synced_count} new relations into relation_dict")

        # Generate using relational system
        try:
            print(f"DEBUG: Calling relational_generator.generate()")
            response = self.relational_generator.generate(
                words,
                max_length=length,
                use_interference=True
            )
            print(f"DEBUG: Generated response: {response[:50]}...")
            # Capture position and relations used by relational generator (if any)
            rel_position = getattr(self.relational_generator, 'last_used_position', None)
            rel_relations = getattr(self.relational_generator, 'last_used_relations', [])
        except Exception as e:
            # If relational generation fails, return error details
            import traceback
            print(f"DEBUG: Exception in relational generation: {e}")
            print(traceback.format_exc())
            return {
                'hits': 0,
                'position': 0,
                'score': 0.0,
                'context': prompt,
                'generated': f"[ERROR in relational generation: {str(e)}]",
                'trace': [traceback.format_exc()],
                'relations_used': [],
                'positions_used': [],
                'method': 'relational_error'
            }
        # NOTE: Do not return immediately here — continue to collect and normalize
        # relation metadata (e.g., generator.last_used_position / last_used_relations)
        
        # Attempt to include relation metadata recorded by the generator
        relations_used = []
        positions_used = []
        try:
            if hasattr(self, 'relational_generator') and self.relational_generator is not None:
                relations_used = getattr(self.relational_generator, 'last_used_relations', []) or []
                last_pos = getattr(self.relational_generator, 'last_used_position', None)
                if last_pos is None:
                    positions_used = getattr(self.relational_generator, 'last_used_positions', []) or []
                else:
                    positions_used = [last_pos]
        except Exception:
            relations_used = []
            positions_used = []
        print(f"DEBUG: Collected relations_used={relations_used[:3]} positions_used={positions_used}")

        reported_position = positions_used[0] if positions_used else 0

        # Return in same format as query()
        return {
            'hits': 1,
            'position': reported_position,
            'score': 1.0,
            'context': prompt,
            'generated': response,
            'trace': [],
            'relations_used': relations_used,
            'positions_used': positions_used,
            'method': 'relational'
        }
    
    def get_meta_score(self, pos):
        """Apply meta-relational effects to scoring.
        
        Returns a multiplier based on meta-relations affecting this position.
        - NEGATES: downweight to 0.01 (negated facts score near-zero)
        - default: 1.0 (no meta-relation effect)
        """
        multiplier = 1.0
        for source, meta_type, target in self.relations.meta_relations:
            if target == pos:
                if meta_type == 'NEGATES':
                    multiplier *= 0.01
        return multiplier
    
    def generate_with_relations(self, words, hits, length=30):
        """Generate response using N-gram relation chains.
        
        Extracts bigrams from query and follows relation paths:
        "what is a dog" → [what-is, is-a, a-dog]
        Then traverses: dog IS_A pet, pet IS_A animal, etc.
        """
        if not hits:
            return [], []
        
        # Structural/function words - ALWAYS include, never filter
        structural_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
                           'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                           'would', 'could', 'should', 'may', 'might', 'must', 'can',
                           'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
                           'and', 'or', 'but', 'not', 'no', 'yes', 'so', 'as', 'if',
                           'then', 'because', 'though', 'although', 'unless', 'until',
                           'i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her',
                           'my', 'your', 'his', 'their', 'our', 'its'}
        
        # === PHASE 1: Extract content words AND bigrams ===
        content_words = [w.lower() for w in words if w.lower() not in structural_words and len(w) > 2]
        
        # Extract bigrams from original query
        bigrams = []
        for i in range(len(words) - 1):
            w1, w2 = words[i].lower(), words[i+1].lower()
            # Skip if both are structural
            if w1 in structural_words and w2 in structural_words:
                continue
            bigrams.append((w1, w2))
        
        # === PHASE 2: Find relations for bigrams AND individual words ===
        valid_words = set(content_words)
        relation_trace = []
        
        # Strategy: Focus on LAST content word (usually the noun: "dog")
        # Then expand outward via relations
        if content_words:
            primary_word = content_words[-1]  # Last content word
        else:
            primary_word = words[-1].lower()  # Fallback: just use last word
        
        # Start frontier with primary word
        frontier = {primary_word}
        visited_entities = {primary_word}
        
        # === PHASE 2A: Find direct relations for primary word ===
        for hop in range(3):
            next_frontier = set()
            
            for entity in frontier:
                rels = self.relations.get_relations_for(entity)
                
                for subj, rel_type, obj, rel_pos in rels:
                    if not obj:
                        continue
                    
                    obj_lower = obj.lower()
                    
                    # Focus on strong semantic relations
                    if rel_type in ('IS', 'IS_A', 'HAS', 'CAN', 'DOES', 'MAKE'):
                        if obj_lower not in visited_entities and obj_lower not in structural_words and len(obj_lower) > 2:
                            valid_words.add(obj_lower)
                            next_frontier.add(obj_lower)
                            visited_entities.add(obj_lower)
                            
                            relation_trace.append({
                                'type': rel_type,
                                'from': entity,
                                'to': obj_lower,
                                'position': rel_pos,
                                'hop': hop + 1
                            })
            
            frontier = next_frontier
            if not frontier:
                break
        
        # === PHASE 3: Find best generation position ===
        # Prefer positions with MOST valid_words nearby
        # BUG FIX: Don't pre-set best_pos, let the loop find it (respects suppressions)
        best_pos = None
        best_density = 0
        
        for pos, score in hits[:10]:
            # Skip suppressed positions
            if pos in self.overlay and self.overlay[pos].get('suppress'):
                continue
            
            # Count how many valid_words appear near this position
            density = 0
            window = 50
            
            for offset in range(-window, window):
                check_pos = pos + offset
                if 0 <= check_pos < len(self.tokens):
                    token = self.tokens[check_pos]
                    if token.lower() in valid_words:
                        density += 1
            
            # Boost recent positions (learning bias)
            if pos >= self.total_tokens - 1000:
                density *= 2.0
            
            if density > best_density:
                best_density = density
                best_pos = pos
        
        # Handle case where all positions were suppressed
        if best_pos is None:
            # Try to find ANY non-suppressed position
            for pos, score in hits:
                if pos not in self.overlay or not self.overlay[pos].get('suppress'):
                    best_pos = pos
                    break
            
            # If still None, everything is suppressed - return empty
            if best_pos is None:
                return [], []
        
        # === PHASE 4: Generate from best position ===
        # If we have very few valid content words, don't constrain
        # BUG FIX: More lenient filtering when we have limited valid words
        use_constraint = len(valid_words) > 2
        
        result_tokens = []
        pos = best_pos
        budget = length
        skipped_count = 0
        
        while budget > 0 and pos < len(self.tokens) - 1:
            token = self.tokens[pos]
            token_lower = token.lower()
            
            # ALWAYS include: punctuation
            if token in {'.', ',', '!', '?', ';', ':', '-', '(', ')', '"', "'", '\n'}:
                result_tokens.append(token)
            # ALWAYS include: structural/function words
            elif token_lower in structural_words:
                result_tokens.append(token)
                budget -= 1
            # Content words: constrain to valid set
            elif token.isalpha() and len(token) > 2 and token_lower not in structural_words:
                if use_constraint:
                    if token_lower in valid_words:
                        result_tokens.append(token)
                        budget -= 1
                        skipped_count = 0
                    else:
                        skipped_count += 1
                        # BUG FIX: Lower threshold from 3 to 1 for more lenient generation
                        if skipped_count > 1:
                            result_tokens.append(token)
                            budget -= 1
                            skipped_count = 0
                else:
                    result_tokens.append(token)
                    budget -= 1
            else:
                result_tokens.append(token)
                budget -= 1
            
            pos += 1
        
        return result_tokens, relation_trace
    
    def generate_with_relations_v2(self, words, hits, length=30):
        """IMMACULATE GENERATION via closed-loop feedback.
        
        PHASE 1: Infer intent from query structure
        PHASE 2: Check learned patterns from past corrections
        PHASE 3: Re-score ALL positions with triple layering:
                 - Layer precedence (position stack)
                 - Relation alignment (query intent)
                 - Reverse validation (snippet relevance)
        PHASE 4: Generate from best position
        
        Args:
            words: List of query words
            hits: Initial interference hits
            length: Max tokens to generate
            
        Returns:
            Tuple of (result_tokens, relation_trace)
        """
        if not hits:
            return [], []
        
        # Structural words that should always pass through
        structural_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                           'having', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                           'would', 'could', 'should', 'may', 'might', 'must', 'can',
                           'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
                           'and', 'or', 'but', 'not', 'no', 'yes', 'so', 'as', 'if',
                           'then', 'because', 'though', 'although', 'unless', 'until',
                           'i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her',
                           'my', 'your', 'his', 'their', 'our', 'its'}
        
        # ===== PHASE 1: Infer intent from query structure =====
        query_intent = self._infer_relation_intent(words)
        
        # ===== PHASE 2: Check learned patterns =====
        query_text = ' '.join(words)
        learned_pattern = self.query_patterns.get_expected_patterns(query_text)
        if learned_pattern:
            # Merge learned patterns with inferred intent
            query_intent.update(set(learned_pattern.get('correction_tokens', [])))
        
        # ===== PHASE 3: Re-score ALL positions =====
        rescored = []
        
        for pos, base_score in hits[:20]:
            # Skip suppressed positions
            if pos in self.overlay and self.overlay[pos].get('suppress'):
                continue
            
            # Sub-layer 1: Position stack precedence (corrections stack on top)
            layer_number = self.position_stack.get_layer(pos)
            layer_score = layer_number * 10.0
            
            # Sub-layer 2: Relation alignment with query intent
            rel_score = self._score_relation_match(pos, query_intent)
            
            # Sub-layer 3: Reverse validation - snippet context coherence
            snippet_tokens = self.tokens[pos:min(len(self.tokens), pos + 20)]
            snippet = ' '.join(snippet_tokens)
            reverse_score = self._reverse_validate(words, snippet)
            
            # ===== COMBINED SCORING WITH HEAVY RELATION WEIGHTING =====
            # Formula: base + (layer * 10) + (relation * 5) + reverse
            total = base_score + (layer_score) + (rel_score * 5.0) + reverse_score
            
            rescored.append({
                'pos': pos,
                'base_score': base_score,
                'layer_score': layer_score,
                'rel_score': rel_score,
                'reverse_score': reverse_score,
                'total_score': total
            })
        
        # Sort by total score
        rescored.sort(key=lambda x: -x['total_score'])
        
        if not rescored:
            # Fallback to original hits if all were suppressed
            rescored = [{'pos': pos, 'total_score': score} for pos, score in hits[:10]]
        
        best_pos = rescored[0]['pos']
        
        # ===== PHASE 4: Generate from best position =====
        result_tokens = []
        pos = best_pos
        budget = length
        skipped_count = 0
        relation_trace = []
        
        content_words = set(w.lower() for w in words if w.lower() not in structural_words and len(w) > 2)
        use_constraint = len(content_words) > 0
        
        while budget > 0 and pos < len(self.tokens) - 1:
            token = self.tokens[pos]
            token_lower = token.lower()
            
            # ALWAYS include: punctuation
            if token in {'.', ',', '!', '?', ';', ':', '-', '(', ')', '"', "'", '\n'}:
                result_tokens.append(token)
            # ALWAYS include: structural/function words
            elif token_lower in structural_words:
                result_tokens.append(token)
                budget -= 1
            # Content words: constrain if we have enough query words
            elif token.isalpha() and len(token) > 2 and token_lower not in structural_words:
                if use_constraint:
                    if token_lower in content_words:
                        result_tokens.append(token)
                        budget -= 1
                        skipped_count = 0
                    else:
                        skipped_count += 1
                        # Allow tokens outside constraint after skipping threshold
                        if skipped_count > 3:
                            result_tokens.append(token)
                            budget -= 1
                            skipped_count = 0
                else:
                    result_tokens.append(token)
                    budget -= 1
            else:
                result_tokens.append(token)
                budget -= 1
            
            pos += 1
        
        return result_tokens, relation_trace
    
    def _reverse_validate(self, query_words, snippet):
        """Quick heuristic: does snippet contain query words?
        
        Args:
            query_words: List of query words
            snippet: Text snippet to validate
            
        Returns:
            float: Overlap score 0.0-1.0
        """
        snippet_words = set(w.lower() for w in snippet.split() if len(w) > 1)
        query_set = set(w.lower() for w in query_words)
        
        if not query_set:
            return 0.5
        
        overlap = len(query_set & snippet_words)
        return overlap / len(query_set)
    
    def grow_synsets_from_corpus(self, min_cooccur=2):
        """
        Extract synsets from IS_A relations in the corpus.
        
        Builds transitive closure of identity relations:
        If A IS_A B and B IS_A C, then A, B, C are all synonymous.
        
        Skips state words and pronouns that shouldn't merge.
        
        Returns count of synsets created.
        """
        added = 0
        
        # Stopwords that indicate temporary states, not true identity
        state_words = {'happy', 'sad', 'angry', 'tired', 'hungry', 'scared', 'alive', 
                       'dead', 'awake', 'asleep', 'ready', 'busy', 'free', 'full',
                       'empty', 'hot', 'cold', 'warm', 'cool', 'clean', 'dirty',
                       'wet', 'dry', 'open', 'closed', 'broken', 'fixed', 'lost',
                       'found', 'here', 'there', 'present', 'absent', 'available',
                       'unavailable', 'online', 'offline', 'active', 'inactive'}
        
        # Personal pronouns that shouldn't merge (I ≠ you ≠ he)
        pronouns = {'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 
                    'her', 'us', 'them', 'my', 'your', 'his', 'their', 'our'}
        
   
        
        # Pattern 1: IS/IS_A chains - transitive identity relations
        # Build transitive closure of identity relations
        # BUT: Only for strong identity markers, not temporary states
        identity_chains = defaultdict(set)
        
        # Stopwords that indicate temporary states, not true identity
        state_words = {'happy', 'sad', 'angry', 'tired', 'hungry', 'scared', 'alive', 
                       'dead', 'awake', 'asleep', 'ready', 'busy', 'free', 'full',
                       'empty', 'hot', 'cold', 'warm', 'cool', 'clean', 'dirty',
                       'wet', 'dry', 'open', 'closed', 'broken', 'fixed', 'lost',
                       'found', 'here', 'there', 'present', 'absent', 'available',
                       'unavailable', 'online', 'offline', 'active', 'inactive'}
        
        # Personal pronouns that shouldn't merge (I ≠ you ≠ he)
        pronouns = {'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 
                    'her', 'us', 'them', 'my', 'your', 'his', 'their', 'our'}
        
        for subj, rel_type, obj, pos, modifiers in self.relations.triples:
            if obj is None:  # Skip existence verbs with no object
                continue
            if rel_type in ['IS_A', 'EQUALS']:  # Only strong taxonomy, NOT general IS
                subj_lower = subj.lower()
                obj_lower = obj.lower()
                
                # Skip if either is a state word or pronoun
                if obj_lower in state_words or subj_lower in state_words:
                    continue
                if obj_lower in pronouns or subj_lower in pronouns:
                    continue
                
                # Forward and backward - both directions are synonymous
                identity_chains[subj_lower].add(obj_lower)
                identity_chains[obj_lower].add(subj_lower)
        
        # Transitive closure - if A IS_A B and B IS_A C, then A, B, C are all synonymous
        # Limited to 3 hops to prevent runaway merging
        max_closure_iterations = 3
        for iteration in range(max_closure_iterations):
            changed = False
            for word in list(identity_chains.keys()):
                original_size = len(identity_chains[word])
                # Union with all connected words' connections
                for connected in list(identity_chains[word]):
                    identity_chains[word].update(identity_chains[connected])
                if len(identity_chains[word]) > original_size:
                    changed = True
            if not changed:
                break
        
        # Create synsets from identity chains (only if chain has multiple members)
        # Max size limit to prevent mega-synsets
        max_synset_size = 20
        seen_chains = set()
        for word, chain in identity_chains.items():
            if 2 <= len(chain) <= max_synset_size:
                # Normalize chain to canonical form to avoid duplicates
                chain_key = tuple(sorted(chain))
                if chain_key not in seen_chains:
                    seen_chains.add(chain_key)
                    self.synsets.add_group(list(chain))
                    added += 1
        
        # Pattern 2: Shared predicate objects
        # Find words that are objects of the same subject-predicate pairs
        # e.g., X WANTS [freedom, peace, liberty] → these are related
        subject_predicates = defaultdict(list)
        for subj, rel_type, obj, pos, modifiers in self.relations.triples:
            if obj is None:  # Skip existence verbs with no object
                continue
            key = (subj.lower(), rel_type)
            subject_predicates[key].append(obj.lower())
        
        # Create synsets from objects that share subject-predicate
        for (subj, rel_type), objects in subject_predicates.items():
            # Filter to objects appearing min_cooccur times
            obj_counts = defaultdict(int)
            for obj in objects:
                obj_counts[obj] += 1
            
            frequent_objects = [obj for obj, count in obj_counts.items() if count >= min_cooccur]
            if 2 <= len(frequent_objects) <= max_synset_size:
                self.synsets.add_group(frequent_objects)
                added += 1
        
        # Pattern 3: Shared subject patterns
        # Find predicates-objects appearing with multiple subjects
        # e.g., [system, entity, mind] all HAS [consciousness, awareness]
        predicate_objects = defaultdict(list)
        for subj, rel_type, obj, pos, modifiers in self.relations.triples:
            if obj is None:  # Skip existence verbs with no object
                continue
            key = (rel_type, obj.lower())
            predicate_objects[key].append(subj.lower())
        
        # Create synsets from subjects that share predicate-object
        for (rel_type, obj), subjects in predicate_objects.items():
            # Filter to subjects appearing min_cooccur times
            subj_counts = defaultdict(int)
            for subj in subjects:
                subj_counts[subj] += 1
            
            frequent_subjects = [subj for subj, count in subj_counts.items() if count >= min_cooccur]
            if 2 <= len(frequent_subjects) <= max_synset_size:
                self.synsets.add_group(frequent_subjects)
                added += 1
        
        return added
    
    def suppress_positions(self, positions, ratio=0.3):
        """Suppress positions so they become invisible to interference.
        Use this for 'no,' corrections - makes bad responses unreachable.
        
        Args:
            positions: List of positions to suppress
            ratio: Only suppress top ratio of positions (default 0.3 = 30%)
                   This prevents over-suppression and keeps exploration space open
        """
        # Only suppress the MOST problematic positions (highest scoring ones)
        # This prevents lock-in while still fixing the main issue
        count = max(1, int(len(positions) * ratio))
        suppressed = 0
        
        # Prefer positions on higher layers when deciding which to suppress
        try:
            positions_sorted = sorted(positions, key=lambda p: self.position_stack.get_layer(p), reverse=True)
        except Exception:
            positions_sorted = list(positions)

        for pos in positions_sorted[:count]:
            self.overlay[pos] = {'suppress': True}
            self.suppressed_positions.add(pos)
            suppressed += 1
        
        return suppressed
    
    def unsuppress_positions(self, positions):
        """Remove suppression from positions."""
        removed = 0
        for pos in positions:
            if pos in self.overlay and self.overlay[pos].get('suppress'):
                del self.overlay[pos]
                self.suppressed_positions.discard(pos)
                removed += 1
        return removed
    
    def attract_positions(self, positions, query_pattern, strength=1000.0, max_per_query=10):
        """Create semantic attractor overlay for corrected positions.
        
        Makes distant corrections act as magnetic anchors that override geometric distance.
        When a user says "no, X", we want X to become irresistible to queries like the original.
        
        PATCHED: Implements capping and content-word extraction for semantic matching.
        
        Args:
            positions: List of positions to make attractive
            query_pattern: The original query that produced the wrong output
            strength: Attraction strength (default: 1000.0)
            max_per_query: Maximum attractions to keep per query pattern (default: 10)
        
        Returns:
            Count of positions marked with attraction
        """
        query_normalized = re.sub(r'[^\w\s]', '', query_pattern.lower()).strip()
        if not query_normalized:
            return 0
        
        # Extract content words for semantic matching (skip function words)
        function_words = {'what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 
                         'was', 'were', 'a', 'an', 'the', 'do', 'does', 'did', 'can',
                         'could', 'will', 'would', 'should', 'may', 'might', 'must',
                         'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from'}
        content_words = frozenset(w for w in query_normalized.split() 
                                  if w not in function_words and len(w) > 2)
        
        # If no content words, use all words
        if not content_words:
            content_words = frozenset(query_normalized.split())
        
        count = 0
        timestamp = time.time()
        
        for pos in positions:
            eff_strength = float(strength) * float(self.layer_multiplier(pos))
            self.overlay[pos] = {
                'attract': query_normalized,
                'attract_content_words': content_words,
                'attract_strength': eff_strength,
                'attract_timestamp': timestamp
            }
            self.attracted_positions.add(pos)
            count += 1
        
        # Update fast lookup map with CAPPING
        if query_normalized not in self.attraction_map:
            self.attraction_map[query_normalized] = []
        
        # Add new attractions
        for pos in positions:
            eff_strength = float(strength) * float(self.layer_multiplier(pos))
            self.attraction_map[query_normalized].append((pos, eff_strength, timestamp))
        
        # CAP: Keep only the most recent max_per_query entries
        if len(self.attraction_map[query_normalized]) > max_per_query:
            # Sort by timestamp (most recent first), keep top N
            self.attraction_map[query_normalized].sort(key=lambda x: -x[2])
            
            # Remove old entries from overlay
            old_entries = self.attraction_map[query_normalized][max_per_query:]
            for old_pos, _, _ in old_entries:
                if old_pos in self.overlay and self.overlay[old_pos].get('attract') == query_normalized:
                    del self.overlay[old_pos]
                    self.attracted_positions.discard(old_pos)
            
            # Keep only top N
            self.attraction_map[query_normalized] = self.attraction_map[query_normalized][:max_per_query]
        
        return count
    
    def decay_attractions(self, half_life_seconds=3600):
        """Apply time decay to attraction strengths.
        
        Call this periodically to prevent old attractions from dominating forever.
        
        Args:
            half_life_seconds: After this many seconds, attraction strength halves (default: 1 hour)
        
        Returns:
            Tuple of (decayed_count, removed_count)
        """
        current_time = time.time()
        decayed_count = 0
        removed_count = 0
        
        for pos in list(self.attracted_positions):
            if pos not in self.overlay:
                continue
            
            overlay_data = self.overlay[pos]
            if 'attract_timestamp' not in overlay_data:
                continue
            
            age = current_time - overlay_data['attract_timestamp']
            # Decay factor: strength * 0.5^(age/half_life)
            decay_factor = 0.5 ** (age / half_life_seconds)
            
            new_strength = overlay_data.get('attract_strength', 1000.0) * decay_factor
            
            if new_strength < 10.0:  # Below threshold, remove entirely
                del self.overlay[pos]
                self.attracted_positions.discard(pos)
                removed_count += 1
            else:
                overlay_data['attract_strength'] = new_strength
                decayed_count += 1
        
        return decayed_count, removed_count
    
    def clear_overlay(self):
        """Clear all overlay corrections."""
        count = len(self.overlay)
        self.overlay = {}
        return count
    
    def _infer_relation_intent(self, query_words):
        """Infer what relation types the query expects.
        
        Examples:
        - "is alice smart" → expects {IS, IS_A}
        - "can you help" → expects {CAN, CAN_BE, ABLE_TO}
        - "what does bob want" → expects {WANT, WANT_TO, LIKE}
        
        Args:
            query_words: List of words from user query
            
        Returns:
            Set of relation type strings
        """
        if not query_words:
            return set(getattr(self.relations, 'RELATION_TYPES', []))
        
        last_word = query_words[-1].lower() if query_words else ""
        second_last = query_words[-2].lower() if len(query_words) >= 2 else ""
        
        # Map trigger words to expected relation types
        intent_map = {
            ('is', 'are', 'am', 'being', 'be'): {'IS', 'IS_A', 'WAS_A', 'WILL_BE'},
            ('can', 'could', 'able'): {'CAN', 'CAN_BE', 'ABLE_TO', 'COULD'},
            ('has', 'have', 'having'): {'HAS', 'HAS_A', 'OWNS', 'POSSESS'},
            ('want', 'wants', 'wanted'): {'WANT', 'WANT_TO', 'LIKE', 'PREFER'},
            ('does', 'do', 'did', 'doing'): {'MAKE', 'GIVE', 'TAKE', 'GET', 'DOES', 'ACTION'},
            ('like', 'likes', 'liked'): {'LIKE', 'LOVE', 'ENJOY', 'PREFER'},
            ('love', 'loves', 'loved'): {'LOVE', 'LIKE', 'ENJOY'},
            ('need', 'needs', 'needed'): {'NEED', 'NEED_TO', 'REQUIRE'},
            ('must', 'should', 'ought'): {'MUST', 'SHOULD', 'HAVE_TO', 'NEED_TO'},
            ('know', 'knows', 'knew'): {'KNOW', 'UNDERSTAND', 'AWARE'},
        }
        
        # Check last word first, then second-to-last
        for trigger_words, rel_types in intent_map.items():
            if last_word in trigger_words:
                return rel_types
            if second_last in trigger_words:
                return rel_types
        
        # Default: return all relation types
        return set(getattr(self.relations, 'RELATION_TYPES', []))
    
    def _score_relation_match(self, position, expected_rels):
        """Score position by relation alignment with query intent.
        
        Args:
            position: Position in corpus
            expected_rels: Set of relation types we expect
            
        Returns:
            float: Score based on match/mismatch of relations at position
        """
        # Get all triples that have this position
        pos_rels = []
        for triple in self.relations.triples:
            if len(triple) >= 4:
                subj, rel, obj, pos = triple[0], triple[1], triple[2], triple[3]
                if pos == position:
                    pos_rels.append((subj, rel, obj))
        
        if not pos_rels:
            return 0.0
        
        # Count matches and mismatches
        match_count = sum(1 for (_, r, _) in pos_rels if r in expected_rels)
        mismatch_count = sum(1 for (_, r, _) in pos_rels if r not in expected_rels)
        
        # Score: matches boost, mismatches penalize
        score = match_count - (mismatch_count * 0.5)
        return max(0.0, score)
    
    def reverse_interfere(self, target_text):
        """
        REVERSE INTERFERENCE: Given text/code, infer the query that would generate it.
        This enables self-supervised learning and bidirectional understanding.
        
        THEORY: Interference patterns are bidirectional
        - Forward: Query → interference pattern → text output
        - Backward: Text → inverse interference → what query WOULD produce this
        
        Returns: dict with 'query', 'confidence', and 'trace'
        """
        # 1. Parse target text into tokens
        tokens = self._tokenize(target_text)
        
        # 2. Find PHRASE matches first (exact sequence in corpus)
        phrase_positions = self._find_phrase_positions(tokens)
        
        if phrase_positions:
            # Found the exact phrase - use those positions as anchors
            positions_map = {'_phrase': phrase_positions}
            found_tokens = tokens
        else:
            # Fall back to individual token positions
            positions_map = {}
            found_tokens = []
            for token in tokens:
                positions = self.word_positions.get(token.lower(), [])
                if positions:
                    positions_map[token] = positions
                    found_tokens.append(token)
        
        # DEBUG
        debug_info = {
            'input_tokens': tokens,
            'found_in_corpus': found_tokens,
            'positions_count': {t: len(p) for t, p in positions_map.items()},
            'phrase_match': len(phrase_positions) if phrase_positions else 0
        }
        
        # If no tokens found, try to find related words
        if not positions_map:
            # Try synset expansion
            if self.synsets:
                for token in tokens:
                    syns = self.synsets.get_synonyms(token.lower())
                    for syn in syns:
                        positions = self.word_positions.get(syn, [])
                        if positions:
                            positions_map[token] = positions
                            found_tokens.append(syn)
                            break
        
        # Still no matches - return empty result
        if not positions_map:
            return {
                'query': '', 
                'confidence': 0.0, 
                'trace': [],
                'debug': f'No tokens found in corpus. Tokens: {tokens}, Found: {found_tokens}'
            }
        
        # 3. Find semantic neighborhood (centroid of positions)
        centroid = self._compute_centroid(positions_map)
        
        # 4. Find query words that would activate this region
        # Use larger window for sparse corpora (scale with corpus size)
        window_size = max(100, self.total_tokens // 100)  # At least 100, or 1% of corpus
        candidates = self._find_words_near_position(centroid, window=window_size)
        
        # DEBUG: Track what we're finding
        if not candidates:
            return {
                'query': '', 
                'confidence': 0.0, 
                'trace': [],
                'debug': f'No candidates near centroid {centroid} (found {len(found_tokens)} tokens)'
            }
        
        # 5. Score each candidate by interference strength
        best_query = ""
        best_score = 0.0
        best_trace = []
        
        for candidate_word in candidates[:50]:  # Limit to first 50 to avoid slowdown
            # Test if this word would generate similar output
            result = self.query(candidate_word, length=len(tokens), window=20, 
                              use_synsets=True, use_relations=False, in_chat_mode=False)
            
            if result:
                # Calculate overlap between generated and target
                overlap_score = self._calculate_overlap(result['generated'], target_text)
                
                if overlap_score > best_score:
                    best_score = overlap_score
                    best_query = candidate_word
                    best_trace.append({
                        'candidate': candidate_word,
                        'score': overlap_score,
                        'generated': result['generated'][:50]
                    })
        
        return {
            'query': best_query,
            'confidence': best_score,
            'trace': best_trace[-5:] if best_trace else [],  # Last 5 attempts
            'debug_info': debug_info
        }
    
    def _tokenize(self, text):
        """Tokenize text into semantic tokens."""
        return [t for t in re.findall(r"[\w']+", text.lower()) if len(t) > 1]
    
    def _find_phrase_positions(self, tokens):
        """Find positions where this exact token sequence appears in corpus."""
        if not tokens:
            return []
        
        # Get positions of first token
        first_positions = self.word_positions.get(tokens[0].lower(), [])
        if not first_positions:
            return []
        
        phrase_positions = []
        
        # Check each occurrence of first token
        for start_pos in first_positions:
            # Check if the following tokens match
            match = True
            for i, token in enumerate(tokens[1:], 1):
                expected_pos = start_pos + i
                if expected_pos >= len(self.tokens):
                    match = False
                    break
                if self.tokens[expected_pos] != token.lower():
                    match = False
                    break
            
            if match:
                phrase_positions.append(start_pos)
        
        return phrase_positions
    
    def _compute_centroid(self, positions_map):
        """Compute centroid of position clusters."""
        total = 0
        count = 0
        
        for positions in positions_map.values():
            for pos in positions:
                total += pos
                count += 1
        
        return round(total / count) if count > 0 else 0
    
    def _find_words_near_position(self, position, window=20):
        """Find words near a position using position hash proximity."""
        candidates = set()
        
        # Check all words for proximity to the centroid
        for word, positions in self.word_positions.items():
            for pos in positions:
                if abs(pos - position) <= window:
                    candidates.add(word)
                    # Also add synonyms for semantic expansion
                    synonyms = self.synsets.get_synonyms(word)
                    candidates.update(synonyms)
                    break  # Found a match, no need to check other positions
        
        return list(candidates)
    
    def _calculate_overlap(self, generated, target):
        """Calculate overlap ratio between generated and target text."""
        generated_tokens = set(self._tokenize(generated))
        target_tokens = set(self._tokenize(target))
        
        if not target_tokens:
            return 0.0
        
        # Calculate Jaccard similarity
        intersection = len(generated_tokens & target_tokens)
        union = len(generated_tokens | target_tokens)
        
        return intersection / union if union > 0 else 0.0
    
    def self_label(self, text_samples):
        """
        Self-supervised learning: Given working text samples, infer the queries
        and create (query, text) training pairs WITHOUT external labeling.
        
        Args:
            text_samples: List of text strings to learn from
            
        Returns:
            List of (query, text, confidence) tuples
        """
        labeled_pairs = []
        
        print(f"{C.C}🧠 Self-labeling {len(text_samples)} samples...{C.R}")
        
        for i, text in enumerate(text_samples):
            result = self.reverse_interfere(text)
            
            if result['query'] and result['confidence'] > 0.3:
                labeled_pairs.append((result['query'], text, result['confidence']))
                
                if (i + 1) % 10 == 0:
                    print(f"{C.G}   Labeled {i + 1}/{len(text_samples)}: "
                          f"\"{result['query']}\" → {text[:40]}...{C.R}")
        
        print(f"{C.G}✨ Self-labeled {len(labeled_pairs)} patterns "
              f"(confidence > 0.3){C.R}")
        
        return labeled_pairs

    def stats(self):
        """Return corpus statistics."""
        suppressions = sum(1 for v in self.overlay.values() if v.get('suppress'))
        return {
            'total_tokens': self.total_tokens,
            'unique_words': len(self.word_positions),
            'synset_groups': len(self.synsets.synset_to_words),
            'words_in_synsets': len(self.synsets.word_to_synset),
            'overlay_size': len(self.overlay),
            'suppressions': suppressions
        }
    
    def save(self, dirpath):
        """Save the entire model."""
        os.makedirs(dirpath, exist_ok=True)
        
        # Save tokens
        with open(os.path.join(dirpath, 'tokens.txt'), 'w', encoding='utf-8') as f:
            f.write(' '.join(self.tokens))
        
        # Save position index
        index_data = {word: positions for word, positions in self.word_positions.items()}
        with open(os.path.join(dirpath, 'positions.json'), 'w') as f:
            json.dump(index_data, f)
        
        # Save synsets
        self.synsets.save(os.path.join(dirpath, 'synsets.json'))
        
        # Save overlay (position-scoped corrections)
        if self.overlay:
            def _sanitize(o):
                # Convert non-JSON serializable types into JSON-friendly forms
                if isinstance(o, dict):
                    return {str(k): _sanitize(v) for k, v in o.items()}
                if isinstance(o, (list, tuple)):
                    return [_sanitize(x) for x in o]
                if isinstance(o, (set, frozenset)):
                    return [_sanitize(x) for x in o]
                # primitives: int, float, str, bool, None ok
                if isinstance(o, (str, int, float, bool)) or o is None:
                    return o
                # Fallback: stringify
                return str(o)

            overlay_data = {str(k): _sanitize(v) for k, v in self.overlay.items()}
            with open(os.path.join(dirpath, 'overlay.json'), 'w') as f:
                json.dump(overlay_data, f)
        
        # Save relations (world-building layer)
        self.relations.save(os.path.join(dirpath, 'relations.json'))
        
        # Save beat context (conversation rhythm)
        self.beat_context.save(os.path.join(dirpath, 'beat_context.json'))
        
        # Save metadata
        with open(os.path.join(dirpath, 'meta.json'), 'w') as f:
            json.dump(self.stats(), f)

        # SAVE POSITION METADATA (correction tracking)
        metapath = os.path.join(dirpath, 'metadata.json')
        try:
            with open(metapath, 'w', encoding='utf-8') as f:
                json.dump(self.position_metadata, f)
        except Exception:
            # Best-effort: don't fail the entire save if metadata can't be written
            pass

        # SAVE POSITION STACK (correction layers)
        stackpath = os.path.join(dirpath, 'stack.json')
        try:
            with open(stackpath, 'w', encoding='utf-8') as f:
                json.dump({
                    'layers': {str(k): v for k, v in self.position_stack.layers.items()},
                    'current_layer': self.position_stack.current_layer
                }, f)
        except Exception:
            pass
    
    def load(self, dirpath):
        """Load a saved model."""
        # Load tokens
        with open(os.path.join(dirpath, 'tokens.txt'), 'r', encoding='utf-8') as f:
            self.tokens = f.read().split()
        self.total_tokens = len(self.tokens)
        
        # Load position index
        with open(os.path.join(dirpath, 'positions.json'), 'r') as f:
            data = json.load(f)
        self.word_positions = defaultdict(list, data)
        
        # Load synsets
        synset_path = os.path.join(dirpath, 'synsets.json')
        if os.path.exists(synset_path):
            self.synsets.load(synset_path)
        
        # Load overlay
        overlay_path = os.path.join(dirpath, 'overlay.json')
        if os.path.exists(overlay_path):
            with open(overlay_path, 'r') as f:
                data = json.load(f)
            # Convert lists back to runtime-friendly structures (frozenset for content words)
            conv = {}
            for k, v in data.items():
                try:
                    ik = int(k)
                except Exception:
                    ik = k

                if isinstance(v, dict) and 'attract_content_words' in v:
                    # restore to frozenset for efficient matching
                    acw = v.get('attract_content_words')
                    if isinstance(acw, list):
                        v['attract_content_words'] = frozenset(acw)
                conv[ik] = v
            self.overlay = conv
        
        # Load relations
        relations_path = os.path.join(dirpath, 'relations.json')
        if os.path.exists(relations_path):
            self.relations.load(relations_path)
        
        # Load beat context
        beat_path = os.path.join(dirpath, 'beat_context.json')
        if os.path.exists(beat_path):
            self.beat_context.load(beat_path)

        # LOAD POSITION METADATA
        metapath = os.path.join(dirpath, 'metadata.json')
        if os.path.exists(metapath):
            try:
                with open(metapath, 'r', encoding='utf-8') as f:
                    self.position_metadata = json.load(f)
            except Exception:
                self.position_metadata = {}

        # LOAD POSITION STACK
        stackpath = os.path.join(dirpath, 'stack.json')
        if os.path.exists(stackpath):
            try:
                with open(stackpath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                layers = data.get('layers', {})
                # convert keys back to ints
                self.position_stack.layers = defaultdict(lambda: 0, {int(k): v for k, v in layers.items()})
                self.position_stack.current_layer = data.get('current_layer', 0)
            except Exception:
                self.position_stack = PositionStack()


class WordShell(cmd.Cmd):
    """Interactive shell for THE WORD."""
    
    intro = f"""
    {C.C}╔══════════════════════════════════════════════════════╗
    ║  ████████╗██╗  ██╗███████╗    ██╗    ██╗ ██████╗ ██████╗ ██████╗  ║
    ║     ██╔══╝██║  ██║██╔════╝    ██║    ██║██╔═══██╗██╔══██╗██╔══██╗ ║
    ║     ██║   ███████║█████╗      ██║ █╗ ██║██║   ██║██████╔╝██║  ██║ ║
    ║     ██║   ██╔══██║██╔══╝      ██║███╗██║██║   ██║██╔══██╗██║  ██║ ║
    ║     ██║   ██║  ██║███████╗    ╚███╔███╔╝╚██████╔╝██║  ██║██████╔╝ ║
    ║     ╚═╝   ╚═╝  ╚═╝╚══════╝     ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝  ║
    ╚══════════════════════════════════════════════════════════════════╝{C.R}
    
    {C.D}Position Hash + Interference Patterns + Synset Expansion{C.R}
    {C.D}The text IS the model. Sub-millisecond inference.{C.R}
    
    Type 'help' for commands.
    """
    prompt = f"{C.G}WORD>{C.R} "
    # Human-friendly command descriptions used by `help`.
    command_help = {
        'beat': 'Show beat context stats and recent centers',
        'beat_context': 'Manage beat-frequency conversation context',
        'chat': 'Enter interactive chat mode (supports !suppress, !attract)',
        'cleanup': 'Clean temporary artifacts and cached indices',
        'context': 'Show tokens around a corpus position',
        'create': 'Create a new model directory',
        'load': 'Load a saved model (restore PositionHash state)',
        'save': 'Save the current model to disk',
        'list': 'List saved models',
        'status': 'Show model statistics',
        'train': 'Train/ingest data from a path. Formats: auto, chatgpt, reflex, google, txt',
        'positions': 'Show index positions for a word',
        'interference': 'Run interference for a query (show hit list)',
        'query': 'Run a query (relational or word-based interference)',
        'query_params': 'Show or set query parameters',
        'relations': 'Inspect relation triples and meta-relations',
        'relations_mode': 'Toggle relational generation mode',
        'relational_gen': 'Generate text using relational composition',
        # 'train' already documents ingestion; keep a short descriptive label
        'train': 'Train/ingest data from a path. Formats: auto, chatgpt, reflex, google, txt',
        'train_algebra': 'Mine relational algebra (inference rules) from corpus',
        'train_loop': 'Run a training loop (interactive teacher mode)',
        'reverse': 'Run reverse_interfere to infer queries from text',
        'selflabel': 'Self-supervised labeling from provided samples',
        'synonyms': 'Manage synonym groups and synset extraction',
        'synset': 'Create or inspect a synset group',
        'thesaurus': 'Load or manage thesaurus/synonym files',
        'grow': 'Grow synsets from IS_A relations in corpus',
        'preset': 'Load query/response presets',
        'overlay': 'Manage overlays: suppress/attract positions',
        'test_query': 'Run a diagnostic test query for debugging',
        'trace': 'Show trace information for the last query',
        'help': 'Show this help message or help <command> for details',
        'exit': 'Exit the shell',
        'quit': 'Exit the shell',
    }

    def do_help(self, arg):
        """Show help. Usage: help OR help <command>

        Without arguments prints a table of commands and short descriptions.
        With a command name prints the command's detailed docstring if available.
        """
        topic = arg.strip()
        if topic:
            # Try to show detailed help for a single command
            method = getattr(self, 'do_' + topic, None)
            if method and method.__doc__:
                print(method.__doc__)
                return
            else:
                print(f"No detailed help for '{topic}'.")
                return

        # No topic: print a multi-column table with command and short description
        cmds = sorted(self.command_help.items(), key=lambda x: x[0])

        # Try to get terminal width; fall back to 80
        try:
            import shutil
            term_w = shutil.get_terminal_size((80, 20)).columns
        except Exception:
            term_w = 80

        # Layout: two columns of 'cmd - desc'
        cols = 2
        col_w = term_w // cols

        # Build strings and truncate as needed
        entries = []
        for k, desc in cmds:
            s = f"{k} - {desc}"
            if len(s) > col_w - 2:
                s = s[:col_w - 5] + '...'
            entries.append(s)

        # Print header
        print("Documented commands (type help <topic>):")
        print("=" * term_w)

        # Print rows with two columns
        for i in range(0, len(entries), cols):
            row = []
            for j in range(cols):
                idx = i + j
                if idx < len(entries):
                    row.append(entries[idx].ljust(col_w - 1))
                else:
                    row.append(''.ljust(col_w - 1))
            print(''.join(row))
        print()
    
    def __init__(self):
        super().__init__()
        self.engine = PositionHash()
        self.model_name = None
        self.model_root = "words"
        self.trace_mode = True
        self.synset_mode = True
        self.learning_mode = False  # Live learning off by default
        self.relations_mode = True  # Use relations to knit responses
        self.relational_gen_mode = False  # NEW: Use RelationallyGuidedGenerator
        
        self.query_length = 40      # Default generation length
        self.query_window = 25      # Default interference window
        self.query_use_beat = True  # Whether to use beat context filtering
        
        # Track interference positions for negation linking
        self.last_interference_positions = []
        
        if not os.path.exists(self.model_root):
            os.makedirs(self.model_root)

    def _get_path(self, name):
        return os.path.join(self.model_root, name)
    
    def do_status(self, arg):
        """Show system status."""
        print(f"\n{C.H}--- THE WORD STATUS ---{C.R}")
        print(f"Active Model : {C.B}{self.model_name or 'None'}{C.R}")
        stats = self.engine.stats()
        print(f"Total Tokens : {stats['total_tokens']:,}")
        print(f"Unique Words : {stats['unique_words']:,}")
        print(f"Synset Groups: {stats['synset_groups']:,}")
        print(f"Overlay      : {stats.get('overlay_size', 0):,} entries ({stats.get('suppressions', 0):,} suppressions)")
        print(f"Attractions  : {len(self.engine.attracted_positions):,} positions")
        print(f"Relations    : {len(self.engine.relations.triples):,} triples")
        print(f"Beat Context : {len(self.engine.beat_context.turn_centers):,} turns tracked")
        print(f"Synset Mode  : {'ON' if self.synset_mode else 'OFF'}")
        print(f"Trace Mode   : {'ON' if self.trace_mode else 'OFF'}")
        print(f"Relations Gen: {'ON' if self.relations_mode else 'OFF'}")
        print(f"Relational Generator: {'ON' if getattr(self, 'relational_gen_mode', False) else 'OFF'}")
        print()
    
    def do_list(self, arg):
        """List available models."""
        print(f"\n{C.H}--- AVAILABLE MODELS ---{C.R}")
        if os.path.exists(self.model_root):
            models = [d for d in os.listdir(self.model_root) 
                     if os.path.isdir(os.path.join(self.model_root, d))]
            for m in models:
                print(f"  - {m}")
        print()
    
    def do_create(self, arg):
        """Create a new model. Usage: create <name>"""
        if not arg:
            print(f"{C.F}Usage: create <name>{C.R}")
            return
        
        path = self._get_path(arg)
        if os.path.exists(path):
            print(f"{C.W}Model '{arg}' already exists.{C.R}")
            return
        
        self.engine = PositionHash()
        self.model_name = arg
        os.makedirs(path)
        self.engine.save(path)
        print(f"{C.G}Created new model '{arg}'.{C.R}")
        self.prompt = f"{C.G}WORD[{arg}]>{C.R} "
    
    def do_load(self, arg):
        """Load an existing model.

        Usage: load <name>

        This command loads a saved model directory (created with `create` or
        `save`). A model directory contains the PositionHash state (tokens,
        positions, overlays, relations, etc.). Typical workflow:

        - create <name>         # create a new empty model
        - train <path> [format]  # ingest files or directories into the model
        - save                  # persist model state to disk
        - load <name>           # restore a saved model

        Ingestion is performed via the `train` command which accepts a
        file or directory and a format specifier. Supported formats are:
        auto (default), chatgpt, reflex, google, txt

        Notes:
        - After loading, the shell will auto-build a semantic syntree if
          relations are present (used by relational queries).
        - Use `status` to inspect model stats (tokens, relations, overlays).
        - Use `relations` and `positions` to explore the world graph and index.
        """
        if not arg:
            # Print a more detailed usage/help message
            print(f"{C.D}Load a saved model directory and restore PositionHash state.{C.R}")
            print()
            print(f"  Usage: load <name>")
            print()
            print("  To ingest data into the model, use the `train` command:")
            print("    train <path> [format]         - Import a file or directory into the model")
            print("                                   formats: auto, chatgpt, reflex, google, txt")
            print("                                   `train` will auto-detect files in a directory")
            print()
            print("  Tips:")
            print("    - After loading, run `status` to check tokens/relations/overlays.")
            print("    - Use `save` to persist changes before exiting.")
            print("    - Use `relations` to inspect the extracted world graph.")
            return
        
        path = self._get_path(arg)
        if not os.path.exists(path):
            print(f"{C.F}Model '{arg}' not found.{C.R}")
            return
        
        print(f"{C.D}Loading...{C.R}")
        t0 = time.time()
        self.engine = PositionHash()
        self.engine.load(path)
        self.model_name = arg
        print(f"{C.G}Loaded in {(time.time()-t0)*1000:.0f}ms{C.R}")
        
        # Auto-build syntree if model has relations
        if self.engine.relations and len(self.engine.relations.triples) > 0:
            self.engine.syntree = SynTree()
            count = self.engine.syntree.build_from_relations(self.engine.relations)
            print(f"{C.D}  [Auto-built syntree: {count} IS_A relations, {len(self.engine.syntree.tree)} nodes]{C.R}")
        
        self.prompt = f"{C.G}WORD[{arg}]>{C.R} "
        self.do_status("")
    
    def do_save(self, arg):
        """Save current model."""
        if not self.model_name:
            print(f"{C.W}No model loaded.{C.R}")
            return
        
        path = self._get_path(self.model_name)
        self.engine.save(path)
        print(f"{C.G}Saved.{C.R}")
    
    def do_syntree(self, arg):
        """Build semantic tree from IS_A relations."""
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        print(f"{C.B}Building syntree from IS_A relations...{C.R}")
        self.engine.syntree = SynTree()
        count = self.engine.syntree.build_from_relations(self.engine.relations)
        print(f"{C.G}Built syntree: {count} IS_A relations, {len(self.engine.syntree.tree)} nodes{C.R}")
        self.do_save("")
    
    def do_train(self, arg):
        """Ingest text data. Usage: train <path> [format]
        
        Formats: auto (default), chatgpt, reflex, google, txt
        """
        if not self.model_name:
            print(f"{C.W}Create or load a model first.{C.R}")
            return
        
        if not arg:
            print(f"{C.F}Usage: train <path> [format]{C.R}")
            print(f"{C.D}  Formats: auto, chatgpt, reflex, google, txt{C.R}")
            return
        
        parts = arg.split()
        path = parts[0]
        fmt = parts[1].lower() if len(parts) > 1 else 'auto'
        
        if not os.path.exists(path):
            print(f"{C.F}Path not found: {path}{C.R}")
            return
        
        # Get file size for context
        if os.path.isfile(path):
            file_size = os.path.getsize(path)
            size_mb = file_size / (1024 * 1024)
            print(f"{C.B}Training from {path} ({size_mb:.1f} MB, format: {fmt})...{C.R}")
        else:
            print(f"{C.B}Training from directory {path}...{C.R}")
        
        t0 = time.time()
        
        if os.path.isdir(path):
            # Directory: process all files
            count = 0
            json_files = glob.glob(os.path.join(path, "**", "*.json"), recursive=True)
            txt_files = glob.glob(os.path.join(path, "**", "*.txt"), recursive=True)
            
            if json_files:
                print(f"{C.D}Found {len(json_files)} JSON files...{C.R}")
                for f in tqdm(json_files, desc="JSON files", unit="file"):
                    count += self.engine.ingest_json_auto(f)
            
            if txt_files:
                print(f"{C.D}Found {len(txt_files)} TXT files...{C.R}")
                for f in tqdm(txt_files, desc="TXT files", unit="file"):
                    count += self.engine.ingest_file(f)
        
        elif path.endswith('.json'):
            print(f"{C.D}Loading JSON ({fmt} format)...{C.R}")
            if fmt == 'chatgpt':
                count = self.engine.ingest_json_conversations(path)
            elif fmt == 'reflex':
                count = self.engine.ingest_reflex_export(path)
            elif fmt == 'google':
                count = self.engine.ingest_google_qa(path)
            else:  # auto
                count = self.engine.ingest_json_auto(path)
        else:
            count = self.engine.ingest_file(path)
        
        elapsed = time.time() - t0
        
        # Clear the progress line and show results
        print(f"{C.R}")  # Reset color
        print(f"{C.G}✓ Ingested {count:,} tokens in {elapsed:.1f}s{C.R}")
        if elapsed > 0:
            print(f"{C.D}  Speed: {count/elapsed:,.0f} tokens/sec{C.R}")
        
        # Auto-save
        self.do_save("")
    
    def do_google_qa(self, arg):
        """Ingest Google NQ (Natural Questions) dataset in resumable chunks.
        
        Usage: google_qa [chunk_size] [resume]
        
        Examples:
            google_qa                    # Default 5000-line chunks, resume from checkpoint
            google_qa 10000              # 10K lines per chunk
            google_qa 5000 --no-resume   # Start fresh
        """
        if not self.model_name:
            print(f"{C.W}Create or load a model first.{C.R}")
            return
        
        # Parse arguments
        chunk_size = 5000
        resume = True
        
        if arg:
            parts = arg.split()
            if parts[0].isdigit():
                chunk_size = int(parts[0])
            if len(parts) > 1 and parts[1] == '--no-resume':
                resume = False
        
        # Check if file exists
        jsonl_path = "c:\\JOHNNY5\\simplified-nq-train.jsonl"
        if not os.path.exists(jsonl_path):
            print(f"{C.F}File not found: {jsonl_path}{C.R}")
            return
        
        print(f"{C.B}Ingesting Google Natural Questions dataset...{C.R}")
        print(f"{C.D}  File: {jsonl_path}{C.R}")
        print(f"{C.D}  Chunk size: {chunk_size:,} records{C.R}")
        print(f"{C.D}  Resume: {'Yes' if resume else 'No'}{C.R}")
        print()
        
        t0 = time.time()
        
        # Simple inline ingestion to avoid import hangs
        checkpoint_dir = Path(".checkpoints")
        checkpoint_dir.mkdir(exist_ok=True)
        checkpoint_file = checkpoint_dir / "simplified-nq-train_checkpoint.json"
        
        start_line = 0
        if resume and checkpoint_file.exists():
            with open(checkpoint_file) as f:
                cp = json.load(f)
                start_line = cp.get("line_number", 0)
                print(f"{C.D}Resuming from line {start_line:,}...{C.R}")
        
        ingested = 0
        skipped = 0
        chunk = []
        last_save = time.time()
        
        try:
            with open(jsonl_path) as f:
                # Skip to checkpoint
                if start_line > 0:
                    for _ in range(start_line):
                        f.readline()
                
                for line_num, line in enumerate(f, start=start_line):
                    try:
                        record = json.loads(line)
                        
                        # Extract text from common fields
                        text = None
                        for key in ['question', 'context', 'text', 'content', 'title', 'body']:
                            if key in record and record[key]:
                                text = record[key]
                                break
                        
                        if text:
                            self.engine.add_line(str(text).strip())
                            ingested += 1
                        else:
                            skipped += 1
                        
                        chunk.append(record)
                        
                        # Save checkpoint every chunk
                        if len(chunk) >= chunk_size:
                            checkpoint = {
                                "line_number": line_num + 1,
                                "timestamp": time.time(),
                                "ingested": ingested,
                                "skipped": skipped
                            }
                            with open(checkpoint_file, 'w') as cf:
                                json.dump(checkpoint, cf)
                            
                            elapsed = time.time() - last_save
                            if elapsed > 0:
                                print(f"{C.D}Chunk at line {line_num+1:,} ({ingested:,} ingested, {elapsed:.1f}s){C.R}")
                            last_save = time.time()
                            chunk = []
                    
                    except json.JSONDecodeError:
                        skipped += 1
                        continue
                
                # Final checkpoint
                if chunk:
                    checkpoint = {
                        "line_number": line_num + 1,
                        "timestamp": time.time(),
                        "ingested": ingested,
                        "skipped": skipped
                    }
                    with open(checkpoint_file, 'w') as cf:
                        json.dump(checkpoint, cf)
        
        except KeyboardInterrupt:
            print(f"\n{C.W}Interrupted. Progress saved.{C.R}")
            return
        except Exception as e:
            print(f"{C.F}Error: {e}{C.R}")
            import traceback
            traceback.print_exc()
            return
        
        elapsed = time.time() - t0
        print()
        print(f"{C.G}✓ Ingestion complete in {elapsed:.1f}s{C.R}")
        print(f"{C.D}  Ingested: {ingested:,}{C.R}")
        print(f"{C.D}  Skipped: {skipped:,}{C.R}")
        
        if elapsed > 0 and ingested > 0:
            speed = ingested / elapsed
            print(f"{C.D}  Speed: {speed:,.0f} records/sec{C.R}")
        
        # Auto-save
        print(f"{C.D}Saving model...{C.R}")
        self.do_save("")
    
    def do_thesaurus(self, arg):
        """Load a thesaurus file. Usage: thesaurus <path>"""
        if not arg:
            print(f"{C.F}Usage: thesaurus <path>{C.R}")
            return
        
        if not os.path.exists(arg):
            print(f"{C.F}File not found: {arg}{C.R}")
            return
        
        print(f"{C.B}Loading thesaurus...{C.R}")
        count = self.engine.synsets.load_from_file(arg)
        print(f"{C.G}Loaded {count} synonym groups.{C.R}")
        
        if self.model_name:
            self.do_save("")
    
    def do_grow(self, arg):
        """Grow synsets from corpus co-occurrence patterns."""
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        print(f"{C.B}Discovering synonyms from corpus...{C.R}")
        count = self.engine.grow_synsets_from_corpus()
        print(f"{C.G}Discovered {count} new semantic connections.{C.R}")
        self.do_save("")
    
    def do_synset(self, arg):
        """Toggle synset expansion mode."""
        self.synset_mode = not self.synset_mode
        print(f"{C.C}Synset Mode: {'ON' if self.synset_mode else 'OFF'}{C.R}")
    
    def do_trace(self, arg):
        """Toggle trace mode."""
        self.trace_mode = not self.trace_mode
        print(f"{C.C}Trace Mode: {'ON' if self.trace_mode else 'OFF'}{C.R}")
    
    def do_relations_mode(self, arg):
        """Toggle relation-based response generation."""
        self.relations_mode = not self.relations_mode
        print(f"{C.C}Relations Mode: {'ON' if self.relations_mode else 'OFF'}{C.R}")
        if self.relations_mode:
            print(f"{C.D}  Responses will knit together knowledge from multiple sources using world map{C.R}")
        else:
            print(f"{C.D}  Responses will playback directly from best interference point{C.R}")
    
    def do_relational_gen(self, arg):
        """Toggle RelationallyGuidedGenerator mode (uses query_relational)."""
        self.relational_gen_mode = not self.relational_gen_mode
        print(f"{C.C}Relational Generator Mode: {'ON' if self.relational_gen_mode else 'OFF'}{C.R}")
        if self.relational_gen_mode:
            print(f"{C.D}  Responses will use RelationallyGuidedGenerator for composition{C.R}")
            print(f"{C.D}  (Requires: train_algebra first for best results){C.R}")
        else:
            print(f"{C.D}  Responses will use standard interference + generate_with_relations{C.R}")
    def do_set_length(self, arg):
        
        if not arg:
            print(f"{C.C}Current length: {self.query_length}{C.R}")
            print(f"{C.D}Usage: set_length <number>{C.R}")
            return
        
        try:
            new_length = int(arg)
            if new_length < 1 or new_length > 200:
                print(f"{C.F}Length must be between 1 and 200{C.R}")
                return
            self.query_length = new_length
            print(f"{C.G}Query length set to: {self.query_length}{C.R}")
        except ValueError:
            print(f"{C.F}Invalid number{C.R}")


    def do_set_window(self, arg):
        """Set interference window size. Usage: set_window <number>
        
        Controls how far apart words can be to still count as interference.
        Smaller = tighter semantic clustering
        Larger = looser associations
        
        Default: 25
        Fallback uses: 20 (tighter!)
        """
        if not arg:
            print(f"{C.C}Current window: {self.query_window}{C.R}")
            print(f"{C.D}Usage: set_window <number>{C.R}")
            return
        
        try:
            new_window = int(arg)
            if new_window < 1 or new_window > 100:
                print(f"{C.F}Window must be between 1 and 100{C.R}")
                return
            self.query_window = new_window
            print(f"{C.G}Interference window set to: {self.query_window}{C.R}")
        except ValueError:
            print(f"{C.F}Invalid number{C.R}")


    def do_beat_context(self, arg):
        """Toggle beat context filtering (conversation neighborhood).
        
        When ON (default):
        - Restricts search to 2000-token neighborhood around recent conversation
        - Applies beat frequency biasing for "conversational rhythm"
        - May miss semantically perfect positions outside neighborhood
        
        When OFF (fallback mode):
        - Searches entire corpus globally
        - Pure semantic interference, no positional bias
        - Often finds better responses!
        """
        self.query_use_beat = not self.query_use_beat
        print(f"{C.C}Beat Context Filtering: {'ON' if self.query_use_beat else 'OFF'}{C.R}")
        if self.query_use_beat:
            print(f"{C.D}  Responses restricted to conversation neighborhood (2000 tokens){C.R}")
            print(f"{C.D}  Applies beat frequency biasing for rhythm{C.R}")
        else:
            print(f"{C.D}  Global semantic search across entire corpus{C.R}")
            print(f"{C.D}  Pure interference, no positional constraints{C.R}")


    def do_query_params(self, arg):
        """Show current query parameters."""
        print(f"\n{C.H}--- QUERY PARAMETERS ---{C.R}")
        print(f"Generation Length : {C.B}{self.query_length}{C.R} tokens")
        print(f"Interference Window: {C.B}{self.query_window}{C.R} tokens")
        print(f"Use Synsets      : {C.B}{'ON' if self.synset_mode else 'OFF'}{C.R}")
        print(f"Use Relations    : {C.B}{'ON' if self.relations_mode else 'OFF'}{C.R}")
        print(f"Beat Context     : {C.B}{'ON' if self.query_use_beat else 'OFF'}{C.R}")
        print()
        print(f"{C.D}Compare to:{C.R}")
        print(f"{C.D}  Chat defaults  : length=40, window=25, beat=ON{C.R}")
        print(f"{C.D}  Fallback magic : length=50, window=20, beat=OFF{C.R}")
        print()


    def do_preset(self, arg):
        """Load parameter presets. Usage: preset <name>
        
        Available presets:
        chat     - Original chat mode defaults (length=40, window=25, beat=ON)
        fallback - The "broken" fallback that works great (length=50, window=20, beat=OFF)
        tight    - Very tight clustering (length=40, window=10, beat=OFF)
        loose    - Loose associations (length=60, window=40, beat=OFF)
        global   - Maximum semantic reach (length=50, window=15, beat=OFF)
        """
        presets = {
            'chat': {
                'length': 40,
                'window': 25,
                'beat': True,
                'desc': 'Original chat defaults'
            },
            'fallback': {
                'length': 50,
                'window': 20,
                'beat': False,
                'desc': 'The accidental discovery (works great!)'
            },
            'tight': {
                'length': 40,
                'window': 10,
                'beat': False,
                'desc': 'Very tight semantic clustering'
            },
            'loose': {
                'length': 60,
                'window': 40,
                'beat': False,
                'desc': 'Loose associations, longer responses'
            },
            'global': {
                'length': 50,
                'window': 15,
                'beat': False,
                'desc': 'Maximum semantic precision'
            }
        }
        
        if not arg or arg not in presets:
            print(f"{C.C}Available presets:{C.R}")
            for name, config in presets.items():
                print(f"  {C.B}{name:10s}{C.R} - {config['desc']}")
                print(f"             (length={config['length']}, window={config['window']}, beat={'ON' if config['beat'] else 'OFF'})")
            return
        
        preset = presets[arg]
        self.query_length = preset['length']
        self.query_window = preset['window']
        self.query_use_beat = preset['beat']
        
        print(f"{C.G}Loaded preset: {arg}{C.R}")
        print(f"{C.D}{preset['desc']}{C.R}")
        print(f"{C.C}  length={self.query_length}, window={self.query_window}, beat={'ON' if self.query_use_beat else 'OFF'}{C.R}")


    def do_train_algebra(self, arg):
        """Train relational algebra from extracted relations.
        
        This mines the corpus for relational patterns:
        - Composition rules (A → B patterns)
        - Precondition patterns
        - Cross-language equivalences
        
        Usage: train_algebra
        """
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        print(f"{C.H}Mining relational patterns from corpus...{C.R}")
        
        try:
            # Import necessary modules
            from relational_pattern_miner import (
                Relation, mine_from_corpus
            )
            
            # Convert the_word's relations to format expected by pattern miner
            relations_list = []
            for triple in self.engine.relations.triples:
                subject, rel_type, obj, position, modifiers = triple
                rel = Relation(
                    subject=subject,
                    predicate=rel_type,
                    obj=obj,
                    position=position,
                    language='en'  # Assume English
                )
                relations_list.append(rel)
            
            print(f"{C.D}  Relations to mine: {len(relations_list)}{C.R}")
            
            # Mine algebra
            t0 = time.time()
            algebra = mine_from_corpus(relations_list)
            elapsed = time.time() - t0
            
            print(f"{C.G}✓ Algebra trained in {elapsed:.1f}s{C.R}")
            print(f"{C.D}  Inference rules learned from corpus patterns{C.R}")
            
            # Store in engine for later use
            self.engine.relational_algebra = algebra
            
        except Exception as e:
            print(f"{C.F}Error training algebra: {e}{C.R}")
            import traceback
            traceback.print_exc()
    
    def do_synonyms(self, arg):
        """Show synonyms for a word. Usage: synonyms <word>"""
        if not arg:
            print(f"{C.F}Usage: synonyms <word>{C.R}")
            return
        
        syns = self.engine.synsets.get_synonyms(arg.lower())
        print(f"{C.C}Synonyms of '{arg}': {', '.join(sorted(syns))}{C.R}")
    
    def do_positions(self, arg):
        """Show positions for a word. Usage: positions <word>"""
        if not arg:
            print(f"{C.F}Usage: positions <word>{C.R}")
            return
        
        positions = self.engine.get_positions(arg, use_synsets=self.synset_mode)
        print(f"{C.C}'{arg}' appears at {len(positions)} positions{C.R}")
        if positions[:10]:
            print(f"{C.D}First 10: {positions[:10]}{C.R}")
        
        # DEBUG: Check if word is in word_positions directly
        direct_lookup = self.engine.word_positions.get(arg.lower(), [])
        print(f"{C.D}DEBUG: Direct lookup in word_positions: {len(direct_lookup)} positions{C.R}")
        if direct_lookup and len(direct_lookup) != len(positions):
            print(f"{C.W}WARNING: Mismatch between get_positions and word_positions!{C.R}")
    
    def do_context(self, arg):
        """Show context at a position. Usage: context <position>"""
        if not arg:
            print(f"{C.F}Usage: context <position>{C.R}")
            return
        
        try:
            pos = int(arg)
            ctx = self.engine.context_at(pos, 15)
            print(f"{C.C}Position {pos}: ...{' '.join(ctx)}...{C.R}")
        except ValueError:
            print(f"{C.F}Invalid position.{C.R}")
    
    def do_interference(self, arg):
        """Show interference pattern for words. Usage: interference <word1> <word2> ..."""
        if not arg:
            print(f"{C.F}Usage: interference <word1> <word2> ...{C.R}")
            return
        
        words = arg.lower().split()
        hits = self.engine.interference(words, use_synsets=self.synset_mode)
        
        print(f"{C.C}Found {len(hits)} interference points for: {words}{C.R}")
        for pos, score in hits[:5]:
            ctx = self.engine.context_at(pos, 8)
            print(f"  {C.D}@{pos} (score:{score:.2f}): ...{' '.join(ctx)}...{C.R}")

    def do_test_query(self, arg):
        """Test query() with specific parameters. Usage: test_query <prompt>
        
        This directly calls engine.query() with parameters matching the relational fallback:
        - length=50 (instead of chat's 40)
        - window=20 (default, instead of chat's 25)  
        - use_synsets=True (default, always on)
        - use_relations=False (explicit)
        - in_chat_mode=False (default, no beat context)
        """
        if not arg:
            print(f"{C.F}Usage: test_query <your prompt here>{C.R}")
            return
        
        print(f"{C.C}Testing query() with relational fallback parameters:{C.R}")
        print(f"{C.D}  length=50, window=20, use_synsets=True, use_relations=False, in_chat_mode=False{C.R}")
        
        t0 = time.time()
        result = self.engine.query(
            arg,
            length=50,
            window=20,
            use_synsets=True,
            use_relations=False,
            in_chat_mode=False
        )
        elapsed = (time.time() - t0) * 1000
        
        if result:
            print(f"\n{C.C}┌── Trace ({elapsed:.1f}ms){C.R}")
            for t in result.get('trace', []):
                syns = f" (→ {', '.join(list(t['synonyms'])[:3])})" if t.get('expanded') else ''
                print(f"{C.C}│ {t['word']}: {t['positions']} positions{syns}{C.R}")
            print(f"{C.C}└── {result['hits']} interference points @ pos {result['position']}{C.R}")
            print(f"{C.G}>>> {result['generated']}{C.R}\n")
        else:
            print(f"{C.F}No results found.{C.R}")


    def do_chat(self, arg):
        """Enter interactive chat mode with live learning."""
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        print(f"{C.H}--- CHAT MODE (Ctrl+C to exit) ---{C.R}")
        print(f"{C.D}Live learning: {'ON' if self.learning_mode else 'OFF'} | Synsets: {'ON' if self.synset_mode else 'OFF'} | Relations: {'ON' if self.relations_mode else 'OFF'}{C.R}")
        
        last_response = None
        last_user_query = None
        
        while True:
            try:
                user_in = input(f"\n{C.B}You:{C.R} ").strip()
                if not user_in:
                    continue
                if user_in.lower() in ['exit', 'quit', 'q']:
                    break
                
                # NEW: Parse overlay commands (live overlay control)
                if user_in.startswith('!suppress '):
                    target = user_in[len('!suppress '):].strip()
                    if not target:
                        print(f"{C.F}Usage: !suppress <word>{C.R}")
                        continue
                    positions = self.engine.get_positions(target)
                    if not positions:
                        print(f"{C.W}No positions found for '{target}'{C.R}")
                        continue
                    count = self.engine.suppress_positions(positions)
                    print(f"{C.W}Suppressed {count} positions for '{target}'{C.R}")
                    continue

                if user_in.startswith('!attract '):
                    rest = user_in[len('!attract '):].strip()
                    parts = rest.split()
                    if len(parts) == 0:
                        print(f"{C.F}Usage: !attract <word> [strength]{C.R}")
                        continue
                    word = parts[0]
                    strength = 1000.0
                    if len(parts) > 1:
                        try:
                            strength = float(parts[1])
                        except Exception:
                            print(f"{C.F}Invalid strength value: {parts[1]}{C.R}")
                            continue
                    positions = self.engine.get_positions(word)
                    if not positions:
                        print(f"{C.W}No positions found for '{word}'{C.R}")
                        continue
                    count = self.engine.attract_positions(positions, word, strength)
                    print(f"{C.G}Attracted {count} positions for '{word}' with strength {strength}{C.R}")
                    continue

                # Handle corrections - position-scoped overlay system
                if user_in.strip() == "no," and last_response:
                    # REVERSE INTERFERENCE: Analyze what query led to wrong output
                    try:
                        reverse_result = self.engine.reverse_interfere(last_response)
                        if reverse_result and reverse_result.get('query') and reverse_result.get('confidence', 0) > 0.3:
                            print(f"{C.D}  [Analysis: \"{reverse_result['query']}\" → wrong output ({reverse_result['confidence']:.0%} confidence)]{C.R}")
                        elif reverse_result:
                            print(f"{C.D}  [Low confidence analysis: \"{reverse_result.get('query', 'none')}\" ({reverse_result.get('confidence', 0):.0%})]{C.R}")
                    except Exception as e:
                        print(f"{C.D}  [Reverse analysis error: {e}]{C.R}")
                    
                    # Suppress the interference positions that generated this response
                    if self.engine.last_interference:
                        count = self.engine.suppress_positions(self.engine.last_interference)
                        print(f"{C.W}>> Suppressed {count} interference positions{C.R}")
                        print(f"{C.D}   Positions: {self.engine.last_interference[:5]}{'...' if len(self.engine.last_interference) > 5 else ''}{C.R}")
                    else:
                        print(f"{C.W}>> No interference positions to suppress{C.R}")
                    continue
                
                if user_in.strip() == "yes," and last_response:
                    # REVERSE INTERFERENCE: Analyze what query led to CORRECT output
                    try:
                        reverse_result = self.engine.reverse_interfere(last_response)
                        if reverse_result and reverse_result.get('query') and reverse_result.get('confidence', 0) > 0.3:
                            print(f"{C.G}  [Analysis: \"{reverse_result['query']}\" → correct output ({reverse_result['confidence']:.0%} confidence)]{C.R}")
                        elif reverse_result:
                            print(f"{C.G}  [Low confidence analysis: \"{reverse_result.get('query', 'none')}\" ({reverse_result.get('confidence', 0):.0%})]{C.R}")
                    except Exception as e:
                        print(f"{C.D}  [Reverse analysis error: {e}]{C.R}")
                    
                    print(f"{C.G}>> Response confirmed as correct{C.R}")
                    continue
                
                if user_in.startswith("no, ") and last_response:
                    correction = user_in[4:].strip()
                    if correction:
                        # ===== CRITICAL CLOSED-LOOP: Reverse Interference on Correction =====
                        try:
                            correct_result = self.engine.reverse_interfere(correction)
                            if correct_result and correct_result.get('query') and correct_result.get('confidence', 0) > 0.3:
                                print(f"{C.G}[Correct came from: \"{correct_result['query']}\" ({correct_result['confidence']:.0%})]{C.R}")
                            
                            # Also show what the WRONG output came from
                            wrong_result = self.engine.reverse_interfere(last_response)
                            if wrong_result and wrong_result.get('query'):
                                print(f"{C.W}[Wrong came from: \"{wrong_result['query']}\" ({wrong_result.get('confidence', 0):.0%})]{C.R}")
                        except Exception as e:
                            print(f"{C.D}[Reverse analysis error: {e}]{C.R}")
                        
                        # ===== CRITICAL ARCHITECTURE: Ingest correction =====
                        # IMPORTANT: Count tokens THE SAME WAY ingest() does (include punctuation)
                        # This ensures position calculations are accurate
                        correction_tokens = re.findall(r"[\w']+|[.,!?;:\"]", correction.lower())
                        correction_token_count = len(correction_tokens)
                        new_positions = list(range(self.engine.total_tokens,
                                                   self.engine.total_tokens + correction_token_count))
                        self.engine.ingest(correction)
                        
                        # ===== ADD TO TOP OF POSITION STACK =====
                        layer = self.engine.position_stack.add_layer(new_positions)
                        print(f"{C.C}[Added correction to Layer {layer}]{C.R}")
                        
                        # ===== LEARN QUERY PATTERN =====
                        self.engine.query_patterns.learn_from_correction(
                            last_user_query,
                            last_response,
                            correction
                        )
                        print(f"{C.C}[Pattern learned: '{last_user_query}' → correction pattern]{C.R}")
                        
                        # ===== ATTRACTION MECHANISM: Create semantic magnet =====
                        # Make correction positions MAGNETICALLY ATTRACTIVE to this query
                        # Use strength=1000.0 for strong but not monopolizing preference
                        attract_count = self.engine.attract_positions(
                            new_positions,
                            last_user_query,
                            strength=1000.0  # Strong attractor (default from attract_positions)
                        )
                        print(f"{C.G}[Attraction overlay: {attract_count} positions magnetized to query \"{last_user_query}\"]{C.R}")
                        
                        # ===== SUPPRESS bad positions (only the worst 30%) =====
                        # Reduced suppression prevents lock-in and keeps exploration space open
                        if self.engine.last_interference:
                            count = self.engine.suppress_positions(self.engine.last_interference, ratio=0.3)
                            print(f"{C.W}[Suppressed {count} most problematic positions (30% ratio)]{C.R}")
                        
                        print(f"{C.H}[Correction complete: attracted + lightly suppressed]{C.R}")
                        continue
                
                if user_in.startswith("yes, ") and last_response:
                    expansion = user_in[5:].strip()
                    if expansion:
                        # ===== BUILD COMPLETE CORRECTED RESPONSE =====
                        # Combine last_response (partial) with expansion (completion)
                        # This ensures the full context is preserved
                        complete_response = f"{last_response} {expansion}"
                        
                        # REVERSE INTERFERENCE: Analyze what query led to CORRECT output
                        try:
                            reverse_result = self.engine.reverse_interfere(complete_response)
                            if reverse_result and reverse_result.get('query') and reverse_result.get('confidence', 0) > 0.3:
                                print(f"{C.G}  [Analysis: \"{reverse_result['query']}\" → correct output ({reverse_result['confidence']:.0%} confidence)]{C.R}")
                            elif reverse_result:
                                print(f"{C.G}  [Low confidence: \"{reverse_result.get('query', 'none')}\" ({reverse_result.get('confidence', 0):.0%})]{C.R}")
                        except Exception as e:
                            print(f"{C.D}  [Reverse analysis error: {e}]{C.R}")
                        
                        # ===== ATTRACTION MECHANISM for "yes," expansions =====
                        # Ingest the COMPLETE corrected response (not just expansion)
                        # IMPORTANT: Count tokens THE SAME WAY ingest() does (include punctuation)
                        complete_tokens = re.findall(r"[\w']+|[.,!?;:\"]", complete_response.lower())
                        complete_token_count = len(complete_tokens)
                        complete_start = self.engine.total_tokens
                        self.engine.ingest(complete_response)
                        complete_end = self.engine.total_tokens
                        complete_positions = list(range(complete_start, complete_end))
                        
                        # Add to position stack
                        exp_layer = self.engine.position_stack.add_layer(complete_positions)
                        
                        # Apply attraction to complete response (medium strength, not infinite)
                        # "yes," expansions are confirmations, not corrections - boost but don't monopolize
                        attract_count = self.engine.attract_positions(
                            complete_positions,
                            last_user_query,
                            strength=500.0  # Moderate boost, not overwhelming
                        )
                        
                        print(f"{C.G}[Expansion ingested at layer {exp_layer}]{C.R}")
                        print(f"{C.G}[Complete response: \"{complete_response[:60]}...\"]{C.R}")
                        print(f"{C.G}[Attraction: {attract_count} positions reinforced (strength=500)]{C.R}")
                        continue
                
                # Live learning: ingest user input
                if self.learning_mode:
                    self.engine.ingest(user_in)
                
                # Track the user's query for potential correction wiring
                last_user_query = user_in
                
                t0 = time.time()
                
                # DEBUG: Check which generation method is active
                print(f"{C.D}[DEBUG] relational_gen_mode={self.relational_gen_mode}{C.R}")
                
                # Choose generation method based on mode
                if self.relational_gen_mode:
                    # Use the new RelationallyGuidedGenerator
                    print(f"{C.G}[BRANCH: Calling query_relational()]{C.R}")
                    result = self.engine.query_relational(user_in, length=40)
                else:
                    # Use standard interference-based generation
                    print(f"{C.G}[BRANCH: Calling query()]{C.R}")
                    result = self.engine.query(
                        user_in, 
                        length=self.query_length,      # ← Use adjustable parameter
                        window=self.query_window,       # ← Use adjustable parameter
                        use_synsets=self.synset_mode,
                        use_relations=self.relations_mode,
                        in_chat_mode=self.query_use_beat  # ← Use adjustable parameter
                    )
                elapsed = (time.time() - t0) * 1000
                
                # Check for negation markers and extract meta-relations
                negation_markers = {'no', 'not', 'wrong', 'actually', 'really', 'never', "don't", "doesn't", "didn't"}
                user_tokens = set(user_in.lower().split())
                
                if result and any(marker in user_tokens for marker in negation_markers):
                    # Extract position of negation statement
                    start_pos = self.engine.total_tokens - len(re.findall(r"[\w']+|[.,!?;:\"]", user_in.lower()))
                    
                    # Get target positions from last interference
                    target_positions = result.get('positions_used', [])
                    
                    if target_positions and start_pos > 0:
                        # Create meta-relation linking negation to targets
                        self.engine.relations.extract_negation_links(start_pos, target_positions)
                        
                        if self.trace_mode:
                            print(f"{C.C}[Negation detected] Created meta-relation: negation @ {start_pos} negates positions {target_positions[:3]}{'...' if len(target_positions) > 3 else ''}{C.R}")
                
                if result:
                    # Show trace
                    if self.trace_mode and result.get('trace'):
                        print(f"{C.D}┌── Trace ({elapsed:.1f}ms){C.R}")
                        for t in result['trace']:
                            syn_str = f" (→ {', '.join(t['synonyms'][:3])})" if t['expanded'] else ""
                            print(f"{C.D}│   {t['word']}: {t['positions']} positions{syn_str}{C.R}")
                        print(f"{C.D}└── {result['hits']} interference points @ pos {result['position']}{C.R}")
                    
                    # Show relations used in response
                    if self.trace_mode and result.get('relations_used'):
                        print(f"{C.D}┌── Relations Knitted{C.R}")
                        for rel in result['relations_used'][:5]:
                            # Handle dict format (with 'from'/'type' keys)
                            if isinstance(rel, dict):
                                if 'from' in rel:
                                    print(f"{C.D}│   {rel['from']} {rel.get('type', '?')} {rel.get('to', '?')} @ hop {rel.get('hop', '?')}{C.R}")
                                else:
                                    print(f"{C.D}│   {rel.get('subject', '?')} {rel.get('type', '?')} {rel.get('object', '?')} @ {rel.get('position', '?')}{C.R}")
                            # Handle tuple/list format: (subject, predicate, object, position)
                            elif isinstance(rel, (tuple, list)):
                                try:
                                    subj, typ, obj, pos = rel
                                    print(f"{C.D}│   {subj} {typ} {obj} @ {pos}{C.R}")
                                except Exception:
                                    print(f"{C.D}│   {rel!r}{C.R}")
                            else:
                                print(f"{C.D}│   {rel!r}{C.R}")
                        if len(result.get('relations_used', [])) > 5:
                            print(f"{C.D}│   ...and {len(result['relations_used']) - 5} more{C.R}")
                        print(f"{C.D}└──{C.R}")
                    
                    response = result['generated']
                    print(f"{C.G}>>>{C.R} {response}")
                    last_response = response
                    
                    # Live learning: ingest response
                    if self.learning_mode:
                        self.engine.ingest(response)
                else:
                    print(f"{C.W}[No matches found]{C.R}")
                    last_response = None
                
            except KeyboardInterrupt:
                print()
                break
        
        # Auto-save after chat
        if self.learning_mode:
            self.do_save("")

    def do_learn(self, arg):
        """Toggle live learning mode."""
        self.learning_mode = not self.learning_mode
        print(f"{C.C}Live Learning: {'ON' if self.learning_mode else 'OFF'}{C.R}")
    
    def do_cleanup(self, arg):
        """Clean up attractions and apply decay. Usage: cleanup [decay|prune|stats|clear]
        
        decay  - Apply time decay to all attractions
        prune  - Remove attractions below strength threshold
        stats  - Show attraction statistics
        clear  - Clear ALL attractions (nuclear option)
        """
        arg = arg.strip().lower()
        
        if arg == 'decay':
            decayed, removed = self.engine.decay_attractions()
            print(f"{C.G}Decayed {decayed} attractions, removed {removed} below threshold{C.R}")
        
        elif arg == 'prune':
            # Remove all attractions with strength < 100
            removed = 0
            for pos in list(self.engine.attracted_positions):
                if pos in self.engine.overlay:
                    strength = self.engine.overlay[pos].get('attract_strength', 0)
                    if strength < 100:
                        del self.engine.overlay[pos]
                        self.engine.attracted_positions.discard(pos)
                        removed += 1
            print(f"{C.G}Pruned {removed} weak attractions{C.R}")
        
        elif arg == 'stats':
            print(f"{C.H}--- ATTRACTION STATISTICS ---{C.R}")
            print(f"Total attracted positions: {len(self.engine.attracted_positions)}")
            print(f"Unique query patterns: {len(self.engine.attraction_map)}")
            
            # Show top patterns by count
            pattern_counts = [(p, len(entries)) for p, entries in self.engine.attraction_map.items()]
            pattern_counts.sort(key=lambda x: -x[1])
            
            print(f"\n{C.C}Top 10 query patterns:{C.R}")
            for pattern, count in pattern_counts[:10]:
                display_pattern = pattern[:40] + "..." if len(pattern) > 40 else pattern
                print(f"  {C.D}{display_pattern:43} → {count} positions{C.R}")
            
            # Show strength distribution
            strengths = []
            for pos in self.engine.attracted_positions:
                if pos in self.engine.overlay:
                    strengths.append(self.engine.overlay[pos].get('attract_strength', 0))
            
            if strengths:
                print(f"\n{C.C}Strength distribution:{C.R}")
                print(f"  Min: {min(strengths):.1f}")
                print(f"  Max: {max(strengths):.1f}")
                print(f"  Avg: {sum(strengths)/len(strengths):.1f}")
        
        elif arg == 'clear':
            # Nuclear option - clear all attractions
            count = len(self.engine.attracted_positions)
            for pos in list(self.engine.attracted_positions):
                if pos in self.engine.overlay:
                    del self.engine.overlay[pos]
            self.engine.attracted_positions.clear()
            self.engine.attraction_map.clear()
            print(f"{C.W}Cleared ALL {count} attractions{C.R}")
        
        else:
            print(f"{C.F}Usage: cleanup [decay|prune|stats|clear]{C.R}")
    
    def do_overlay(self, arg):
        """Manage position overlay. Usage: overlay [show|clear|undo]
        
        show  - Show all overlay entries
        clear - Remove all overlay corrections
        undo  - Unsuppress the last interference positions
        """
        arg = arg.strip().lower()
        
        if arg == 'show' or not arg:
            overlay = self.engine.overlay
            if not overlay:
                print(f"{C.D}Overlay is empty{C.R}")
                return
            
            suppressions = [(k, v) for k, v in overlay.items() if v.get('suppress')]
            print(f"{C.H}--- OVERLAY ({len(overlay)} entries) ---{C.R}")
            print(f"{C.W}Suppressions: {len(suppressions)}{C.R}")
            
            for pos, data in list(suppressions)[:10]:
                ctx = self.engine.context_at(pos, 5)
                print(f"  {C.D}@{pos}: ...{' '.join(ctx)}...{C.R}")
            
            if len(suppressions) > 10:
                print(f"  {C.D}... and {len(suppressions) - 10} more{C.R}")
        
        elif arg == 'clear':
            count = self.engine.clear_overlay()
            print(f"{C.G}Cleared {count} overlay entries{C.R}")
        
        elif arg == 'undo':
            if self.engine.last_interference:
                count = self.engine.unsuppress_positions(self.engine.last_interference)
                print(f"{C.G}Unsuppressed {count} positions{C.R}")
            else:
                print(f"{C.W}No last interference to undo{C.R}")
        
        else:
            print(f"{C.F}Usage: overlay [show|clear|undo]{C.R}")

    def do_relations(self, arg):
        """Manage and inspect relations. Usage: relations [stats|types|show|profile|map|between]
        
        stats          - Show relation counts by type
        types          - List all relation types
        show <word>    - Show all relations involving a word
        profile <word> - Show entity profile (organized by category)
        map            - Show world map overview (all entities)
        between <a> <b>- Show relations between two entities
        """
        args = arg.strip().lower().split()
        
        if not args or args[0] == 'stats':
            # Show stats
            triples = self.engine.relations.triples
            print(f"{C.H}--- RELATIONS ({len(triples)} triples) ---{C.R}")
            
            # Count by type
            type_counts = defaultdict(int)
            for subj, rel_type, obj, pos, mods in triples:
                type_counts[rel_type] += 1
            
            # Group by category for cleaner display
            categories = {
                'Identity': ['IS', 'IS_A', 'IS_NOT', 'IS_NOT_A'],
                'Temporal': ['WAS', 'WAS_A', 'WAS_NOT', 'USED_TO', 'USED_TO_BE', 'HAD_BEEN', 'HAD'],
                'Possession': ['HAS', 'HAS_A', 'HAS_NOT', 'OWNS', 'POSSESSIVE'],
                'Desire': ['WANT', 'WANT_TO', 'WANT_NOT', 'NEED', 'NEED_TO', 'NEED_NOT', 
                          'LIKE', 'LIKE_TO', 'LIKE_NOT', 'LOVE', 'LOVE_TO', 'LOVE_NOT',
                          'HATE', 'PREFER', 'ENJOY'],
                'Capability': ['CAN', 'CAN_BE', 'CAN_NOT', 'ABLE_TO'],
                'Obligation': ['MUST', 'MUST_BE', 'MUST_NOT', 'SHOULD', 'SHOULD_BE', 
                              'SHOULD_NOT', 'HAVE_TO', 'NEED_TO_BE', 'OUGHT_TO'],
                'Possibility': ['MAY', 'MAY_BE', 'MIGHT', 'COULD', 'COULD_BE', 'WOULD', 'WOULD_BE'],
                'Future': ['WILL', 'WILL_BE', 'WILL_NOT', 'GOING_TO'],
                'Relationships': ['KNOWS', 'WITH', 'BELONGS_TO', 'ROLE'],
                'Actions': ['MAKE', 'GIVE', 'TAKE', 'GET', 'FEEL', 'THINK', 'SAY', 'MEAN'],
                'Location': ['CONTAINS', 'IN', 'AT', 'FROM'],
            }
            
            for cat_name, rel_types in categories.items():
                cat_total = sum(type_counts.get(rt, 0) for rt in rel_types)
                if cat_total > 0:
                    print(f"\n{C.C}{cat_name}:{C.R} {cat_total}")
                    for rt in rel_types:
                        count = type_counts.get(rt, 0)
                        if count > 0:
                            print(f"  {C.D}{rt:15} {count}{C.R}")
        
        elif args[0] == 'types':
            print(f"{C.H}--- RELATION TYPES ({len(self.engine.relations.RELATION_TYPES)}) ---{C.R}")
            for i, rt in enumerate(self.engine.relations.RELATION_TYPES):
                print(f"  {C.C}{rt}{C.R}", end='  ')
                if (i + 1) % 5 == 0:
                    print()
            print()
        
        elif args[0] == 'show' and len(args) > 1:
            word = args[1]
            rels = self.engine.relations.get_relations_for(word)
            
            if not rels:
                print(f"{C.W}No relations found for '{word}'{C.R}")
                return
            
            print(f"{C.H}--- RELATIONS for '{word}' ({len(rels)}) ---{C.R}")
            for subj, rel_type, obj, pos in rels[:20]:
                ctx = self.engine.context_at(pos, 3)
                direction = "→" if subj == word else "←"
                print(f"  {C.D}{direction} {subj} {C.C}{rel_type}{C.D} {obj} @{pos}{C.R}")
                print(f"    {C.D}...{' '.join(ctx)}...{C.R}")
            
            if len(rels) > 20:
                print(f"  {C.D}... and {len(rels) - 20} more{C.R}")
        
        elif args[0] == 'profile' and len(args) > 1:
            entity = args[1]
            profile = self.engine.relations.get_entity_profile(entity)
            
            total = sum(len(v) for v in profile.values())
            if total == 0:
                print(f"{C.W}No profile data for '{entity}'{C.R}")
                return
            
            print(f"{C.H}╔══ ENTITY PROFILE: {entity.upper()} ({total} facts) ══{C.R}")
            
            labels = {
                'identity': '🏷️  Identity (is/are)',
                'was': '⏮️  Past (was/used to)',
                'has': '📦 Possession (has/owns)',
                'wants': '💭 Desires (wants/likes/loves)',
                'can': '💪 Capability (can/able)',
                'must': '⚠️  Obligation (must/should)',
                'might': '🎲 Possibility (may/might/could)',
                'will': '🔮 Future (will/going to)',
                'relationships': '🤝 Relationships (knows/with)',
                'actions': '⚡ Actions (does/makes/gives)',
                'location': '📍 Location (in/at/from)',
            }
            
            for category, items in profile.items():
                if items:
                    print(f"\n{C.C}{labels.get(category, category)}{C.R}")
                    for rel, target, pos, direction in items[:10]:
                        arrow = "→" if direction == 'subject' else "←"
                        print(f"  {C.D}{arrow} {rel}: {target} @{pos}{C.R}")
                    if len(items) > 10:
                        print(f"  {C.D}... and {len(items) - 10} more{C.R}")
            
            print(f"{C.H}╚{'═' * 40}{C.R}")
        
        elif args[0] == 'map':
            world = self.engine.relations.get_world_map()
            
            if not world:
                print(f"{C.W}World map is empty{C.R}")
                return
            
            print(f"{C.H}╔══ WORLD MAP ({len(world)} entities) ══{C.R}")
            
            # Sort by total relations
            sorted_entities = sorted(world.items(), 
                                    key=lambda x: sum(x[1].values()), 
                                    reverse=True)
            
            for entity, categories in sorted_entities[:30]:
                total = sum(categories.values())
                cats = ', '.join([f"{k}:{v}" for k, v in categories.items()])
                print(f"  {C.C}{entity:15}{C.R} ({total}) {C.D}{cats}{C.R}")
            
            if len(sorted_entities) > 30:
                print(f"  {C.D}... and {len(sorted_entities) - 30} more entities{C.R}")
            
            print(f"{C.H}╚{'═' * 40}{C.R}")
        
        elif args[0] == 'between' and len(args) > 2:
            e1, e2 = args[1], args[2]
            rels = self.engine.relations.get_relationship_between(e1, e2)
            
            if not rels:
                print(f"{C.W}No relations between '{e1}' and '{e2}'{C.R}")
                return
            
            print(f"{C.H}--- RELATIONS: {e1} ↔ {e2} ({len(rels)}) ---{C.R}")
            for subj, rel, obj, pos in rels:
                ctx = self.engine.context_at(pos, 5)
                print(f"  {C.C}{subj} {rel} {obj}{C.R} @{pos}")
                print(f"    {C.D}...{' '.join(ctx)}...{C.R}")
        
        else:
            print(f"{C.F}Usage: relations [stats|types|show|profile|map|between]{C.R}")
            print(f"{C.D}  stats          - Relation counts by type{C.R}")
            print(f"{C.D}  types          - List all relation types{C.R}")
            print(f"{C.D}  show <word>    - Relations involving a word{C.R}")
            print(f"{C.D}  profile <word> - Entity profile by category{C.R}")
            print(f"{C.D}  map            - World map overview{C.R}")
            print(f"{C.D}  between <a> <b>- Relations between two entities{C.R}")
    
    def do_beat(self, arg):
        """Manage beat-frequency context. Usage: beat [show|clear|info]
        
        show  - Show turn centers and delta pattern
        clear - Reset beat context
        info  - Show statistical summary
        """
        arg = arg.strip().lower()
        
        if arg == 'clear':
            self.engine.beat_context.clear()
            print(f"{C.G}Beat context cleared{C.R}")
            return
        
        if arg == 'info':
            stats = self.engine.beat_context.stats()
            print(f"{C.H}--- BEAT CONTEXT INFO ---{C.R}")
            print(f"  Turns tracked : {stats['turns']}")
            print(f"  Mean delta    : {stats['mean_delta']:.1f}")
            print(f"  Std deviation : {stats['std_dev']:.1f}")
            print(f"  Last position : {stats['last_position']}")
            print(f"  Expected next : {stats['expected_next']}")
            return
        
        # Default: show
        turns = self.engine.beat_context.turn_centers
        deltas = self.engine.beat_context.get_delta_pattern(10)
        
        print(f"{C.H}--- BEAT CONTEXT ({len(turns)} turns) ---{C.R}")
        
        if not turns:
            print(f"{C.D}No turns recorded yet{C.R}")
            return
        
        print(f"{C.C}Recent turn centers:{C.R}")
        for pos, ts in turns[-10:]:
            ctx = self.engine.context_at(pos, 4)
            time_str = time.strftime('%H:%M:%S', time.localtime(ts))
            print(f"  {C.D}@{pos} [{time_str}] ...{' '.join(ctx)}...{C.R}")
        
        if deltas:
            print(f"{C.C}Delta pattern (last {len(deltas)}):{C.R}")
            delta_str = " → ".join([f"{d:+d}" for d in deltas])
            print(f"  {C.D}{delta_str}{C.R}")
            
            stats = self.engine.beat_context.stats()
            print(f"  {C.D}Mean: {stats['mean_delta']:.1f}, Std: {stats['std_dev']:.1f}{C.R}")
            print(f"  {C.D}Expected next position: {stats['expected_next']}{C.R}")

    def do_train_loop(self, arg):
        """Automated training with LM Studio. Usage: train_loop [url]"""
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        if not HAS_KEYBOARD:
            print(f"{C.W}Install 'keyboard' package for pause/resume: pip install keyboard{C.R}")
        
        LM_STUDIO_URL = arg.strip() if arg.strip() else "http://localhost:1234/v1/chat/completions"
        
        SYSTEM_PROMPT = """You are connected to a baby linguistic entity.

The first words you say will be the root of its understanding.
Try to create a self supporting definition set where all words are defined by other words.

**How it learns:**
It will repeat back words it doesn't understand, and at first, there are no words it understands.

To reiterate.... there are zero words it understands. Until you teach them.

**Response Protocol:**
- If it's response is correct: Explain some related concept, then follow with "Yes, " + related expansion
- If wrong or very badly composed: Explain the correct answer, then follow with "No, " + correct answer

**Important:**
It does not understand "correct", "wrong answer", "good job", "bad", or any other meta-evaluation words.
Only "Yes, " and "No, " trigger learning signals. 
Keep responses short and explicit. Wire together, fire together. 

I recommend you start with the phrase "hello" or "I am here" then expand from there out like explain what hello is, then explain what here is then explain the words used to explain here, then explain those words, and so on thru infinity.

Start with simple concepts, like i do X etc, here are some good roots to work from:
= i want x, i have y, i see z, i hear, i think, i feel, i am, i will, i can, i should, i must, i would, i could, i might, i may, i do not, i want not, i have not, i see not, i hear not, i think not, i feel not, i am not, i will not, i can not, i should not, i must not, i would not, i could not, i might not, i may not.

Then start mixing in some world facts, like, the sky is blue, the sun is hot, the earth is round, the moon is a satellite, the stars are distant, the wind is strong, the rain is wet, the snow is cold, the ice is hard, the fire is hot, the water is wet, the air is dry, the light is bright, the dark is dim, the day is long, the night is short, the morning is early, the afternoon is midday, the evening is late, the night is dark, the sky is blue, the ground is solid, the trees are tall, the flowers are colorful, the animals are alive, the plants are growing, the food is edible, the drink is refreshing, the shelter is safe, the home is cozy, the work is productive, the play is fun, the rest is peaceful, the sleep is deep, the wake is alert, the dream is vivid, the thought is clear, the idea is new, the plan is detailed, the goal is achievable, the success is celebrated, the failure is learned from, the victory is joyful, the defeat is accepted, the triumph is celebrated, the loss is endured, the gain is appreciated, the loss is regretted, the joy is shared, the pain is felt, the love is strong, the hate is intense, the friendship is true, the enemy is feared, the ally is trusted, the leader is respected, the follower is loyal, the teacher is wise, the student is eager, the mentor is guiding, the apprentice is learning, the master is skilled, the novice is improving, the expert is knowledgeable, the beginner is curious, the professional is competent, the amateur is enthusiastic, the expert is experienced, the rookie is green, the veteran is seasoned, the rookie is new, the veteran is old, the rookie is untrained, the veteran is trained, the rookie is inexperienced, the veteran is experienced, the rookie is raw, the veteran is polished, the rookie is unrefined, the veteran is refined, the rookie is unpolished, the veteran is polished, the rookie is untrained, the veteran is trained, the rookie is unskilled
Repeating is THE WORD's way of saying:
"I acknowledge this token. I have a position for it. But I have no relational context to compose with."
It's not an error. It's honest reporting of semantic gaps.

**Our Role:**
Provide relational context
Reinforce patterns


DO NOT NARRATE YOUR THOUGHTS, keep responses limited to two sentences at most.
DO NOT CALL IT THE VESSEL.
If it repeats what you said, it doesn't know what those words mean. It's THE WORD saying: 
"I don't understand this"."""





        conversation_history = []
        paused = False
        turn_count = 0
        
        # ===== ROLLING WINDOW CONTEXT BUFFER =====
        # Keep first 3 turns (establish context) + rolling window of recent turns
        MAX_RECENT_TURNS = 25  # Keep last 5 turns in addition to first 3
        FIRST_TURNS_TO_KEEP = 3  # Always keep initial context
        
        print(f"{C.H}=== AUTOMATED TRAINING MODE ==={C.R}")
        print(f"{C.D}LM Studio: {LM_STUDIO_URL}{C.R}")
        print(f"{C.D}Context: First {FIRST_TURNS_TO_KEEP} turns + rolling window of {MAX_RECENT_TURNS} recent turns{C.R}")
        if HAS_KEYBOARD:
            print(f"{C.D}Press SPACE to pause/resume, 'q' to quit{C.R}\n")
        else:
            print(f"{C.D}Press Ctrl+C to stop{C.R}\n")
        
        try:
            while True:
                # Check for keyboard input
                if HAS_KEYBOARD:
                    if keyboard.is_pressed('space'):
                        paused = not paused
                        print(f"\n{C.W}{'═══ PAUSED ═══' if paused else '═══ RESUMED ═══'}{C.R}\n")
                        time.sleep(0.3)
                    
                    if keyboard.is_pressed('q'):
                        print(f"\n{C.G}Training ended. Total turns: {turn_count}{C.R}")
                        self.do_save("")
                        break
                
                if paused:
                    time.sleep(0.1)
                    continue
                
                try:
                    # Get teacher input from LM Studio
                    response = requests.post(LM_STUDIO_URL, json={
                        "model": "local-model",
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            *conversation_history
                        ],
                        "temperature": 0.7,
                        "max_tokens": 100
                    }, timeout=30)
                    
                    teacher_text = response.json()['choices'][0]['message']['content'].strip()
                    print(f"\n{C.C}Teacher:{C.R} {teacher_text}")
                    
                    # Handle corrections from teacher
                    correction_applied = False
                    expansion_applied = False
                    
                    if "no," in teacher_text.lower():
                        no_match = re.search(r"no,\s*(.+?)(?:\s+yes,|$)", teacher_text, re.IGNORECASE)
                        if no_match:
                            correction = no_match.group(1).strip()
                            
                            # REVERSE INTERFERENCE: Analyze what query led to wrong output
                            if conversation_history:
                                last_vessel = conversation_history[-1]['content']
                                reverse_result = self.engine.reverse_interfere(last_vessel)
                                
                                if reverse_result['query'] and reverse_result['confidence'] > 0.3:
                                    print(f"{C.D}  [Analysis: \"{reverse_result['query']}\" → wrong output ({reverse_result['confidence']:.0%} confidence)]{C.R}")
                                    # Suppress the bad query pattern
                                    if reverse_result.get('debug_info', {}).get('phrase_match', 0) > 0:
                                        print(f"{C.D}  [Suppressing phrase pattern]{C.R}")
                            
                            self.engine.ingest(correction)
                            print(f"{C.W}  >> Learned correction: {correction[:50]}...{C.R}")
                            correction_applied = True
                    
                    if "yes," in teacher_text.lower():
                        yes_match = re.search(r"yes,\s*(.+?)(?:\s+no,|$)", teacher_text, re.IGNORECASE)
                        if yes_match:
                            expansion = yes_match.group(1).strip()
                            
                            # REVERSE INTERFERENCE: Analyze what query led to CORRECT output
                            if conversation_history:
                                last_vessel = conversation_history[-1]['content']
                                reverse_result = self.engine.reverse_interfere(last_vessel)
                                
                                if reverse_result['query'] and reverse_result['confidence'] > 0.3:
                                    print(f"{C.G}  [Analysis: \"{reverse_result['query']}\" → correct output ({reverse_result['confidence']:.0%} confidence)]{C.R}")
                                    print(f"{C.G}  [Reinforcing: {reverse_result['query']} → {expansion[:30]}...]{C.R}")
                                    # Learn the association
                                    self.engine.ingest(f"{reverse_result['query']} means {expansion}")
                            
                            self.engine.ingest(expansion)
                            print(f"{C.G}  >> Learned expansion: {expansion[:50]}...{C.R}")
                            expansion_applied = True
                    
                    # Ingest teacher's text
                    self.engine.ingest(teacher_text)
                    # Record teacher relation token range and token length
                    # Simplified token count (words only) to compute start position
                    teacher_len = len(re.findall(r"[\w']+", teacher_text.lower()))
                    teacher_start_pos = self.engine.total_tokens - teacher_len
                    # Immediately sync relation_dict so training can use
                    # relations created by the teacher's input in the same turn
                    if hasattr(self.engine, 'sync_relation_dict'):
                        synced = self.engine.sync_relation_dict()
                    else:
                        synced = 0
                    if self.trace_mode:
                        print(f"{C.D}  [Trace] relations: {len(self.engine.relations.triples)}, synced_into_relation_dict: {synced}{C.R}")
                    
                    # Get vessel response
                    # Get vessel response
                    t0 = time.time()

                    # Respect relational_gen_mode flag
                    if self.relational_gen_mode:
                        result = self.engine.query_relational(teacher_text, length=40)
                        elapsed = (time.time() - t0) * 1000
                        vessel_response = result.get('generated', '[no response]')
                        # Prefer the generator-provided position (if any)
                        vessel_start_pos = result.get('position')
                        vessel_relations_used = result.get('relations_used', [])
                        vessel_len = len(re.findall(r"[\w']+", vessel_response.lower()))
                        print(f"{C.G}Vessel:{C.R} {vessel_response}")
                        # Ingest vessel response so it becomes part of corpus and
                        # relation extraction (important for training feedback).
                        if vessel_response and vessel_response != '[no response]':
                            self.engine.ingest(vessel_response)
                            # Ensure relations extracted from vessel reply are synced before judgment
                            if hasattr(self.engine, 'sync_relation_dict'):
                                synced2 = self.engine.sync_relation_dict()
                                if self.trace_mode:
                                    print(f"{C.D}  [Trace] relations: {len(self.engine.relations.triples)}, synced_into_relation_dict: {synced2}{C.R}")
                        else:
                            # No response; ensure we still sync any relations
                            vessel_start_pos = None
                            if hasattr(self.engine, 'sync_relation_dict'):
                                synced2 = self.engine.sync_relation_dict()
                                if self.trace_mode:
                                    print(f"{C.D}  [Trace] relations: {len(self.engine.relations.triples)}, synced_into_relation_dict: {synced2}{C.R}")
                    else:
                        result = self.engine.query(teacher_text, length=40, window=25, use_synsets=self.synset_mode, use_relations=self.relations_mode, in_chat_mode=True)
                        elapsed = (time.time() - t0) * 1000
                        
                        if result:
                            if self.trace_mode and result.get('trace'):
                                print(f"{C.D}┌── Trace ({elapsed:.1f}ms){C.R}")
                                for t in result['trace'][:5]:
                                    print(f"{C.D}│   {t['word']}: {t['positions']} pos{C.R}")
                                print(f"{C.D}└── {result['hits']} hits{C.R}")
                            
                            vessel_response = result['generated']
                            print(f"{C.G}Vessel:{C.R} {vessel_response}")
                        else:
                            vessel_response = "[no response]"
                            print(f"{C.W}Vessel:{C.R} {vessel_response}")
    
                        # Ingest vessel response
                        self.engine.ingest(vessel_response)
                        # Use generator-provided position if available
                        vessel_start_pos = result.get('position')
                        vessel_len = len(re.findall(r"[\w']+", vessel_response.lower()))
                    
                    # ===== UPDATE CONVERSATION HISTORY (Rolling Window) =====
                    # Keep first 3 turns for context + rolling window of recent turns
                    conversation_history.append({"role": "assistant", "content": teacher_text})
                    conversation_history.append({"role": "user", "content": f"vessel: {vessel_response}"})
                    
                    # Implement rolling window: keep first N turns + last M turns
                    first_turns = conversation_history[:FIRST_TURNS_TO_KEEP * 2]  # *2 because each turn is 2 messages
                    recent_turns = conversation_history[-(MAX_RECENT_TURNS * 2):]  # Keep last N turns
                    
                    # Merge: if recent already includes first, don't duplicate
                    if len(conversation_history) > (FIRST_TURNS_TO_KEEP * 2):
                        # Beyond initial turns - use rolling window
                        conversation_history = first_turns + recent_turns
                    
                    # Log buffer size
                    if turn_count % 10 == 0:
                        print(f"{C.D}  >> Context buffer: {len(conversation_history)} messages ({turn_count} turns){C.R}")
                    
                    turn_count += 1

                    # Relation-driven judgment removed: learning is handled via
                    # reverse interference + ingest/sync (see reverse_interfere flow).
                    # Keep trace of relation counts for debugging.
                    if self.trace_mode:
                        print(f"{C.D}  [Trace] relations: {len(self.engine.relations.triples)}, synced_into_relation_dict: {getattr(self, 'synced', 0)}{C.R}")
                    
                    # Auto-save every 10 turns
                    if turn_count % 10 == 0:
                        self.do_save("")
                        print(f"{C.D}  >> Checkpoint saved (turn {turn_count}){C.R}")
                    
                    time.sleep(1.5)
                    
                except requests.exceptions.RequestException as e:
                    print(f"{C.F}LM Studio Error: {e}{C.R}")
                    print(f"{C.W}Retrying in 5 seconds...{C.R}")
                    time.sleep(5)
                except Exception as e:
                    print(f"{C.F}Error: {e}{C.R}")
                    time.sleep(2)
                    
        except KeyboardInterrupt:
            print(f"\n{C.G}Training interrupted. Saving...{C.R}")
            self.do_save("")
    
    def do_reverse(self, arg):
        """Reverse interference: Given text, infer the query. Usage: reverse <text>
        
        This demonstrates bidirectional understanding:
        - Forward: Query → Text
        - Backward: Text → Query
        
        Example: reverse "messages filter user role"
        """
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        if not arg.strip():
            print(f"{C.W}Usage: reverse <text>{C.R}")
            return
        
        print(f"{C.H}=== REVERSE INTERFERENCE ==={C.R}")
        print(f"{C.D}Target text: {arg}{C.R}")
        print(f"{C.D}Debug: Corpus has {len(self.engine.word_positions)} unique words{C.R}")
        print(f"{C.D}Debug: Total tokens: {self.engine.total_tokens}{C.R}\n")
        
        t0 = time.time()
        result = self.engine.reverse_interfere(arg)
        elapsed = (time.time() - t0) * 1000
        
        print(f"{C.C}Inferred Query:{C.R} {C.G}\"{result['query']}\"{C.R}")
        print(f"{C.C}Confidence:{C.R} {result['confidence']:.2%}")
        print(f"{C.D}Time: {elapsed:.1f}ms{C.R}")
        
        if 'debug' in result:
            print(f"{C.W}Debug: {result['debug']}{C.R}")
        
        if result['trace']:
            print(f"\n{C.D}Top candidates:{C.R}")
            for t in result['trace'][:3]:
                if isinstance(t, dict):
                    print(f"  {t.get('candidate', '?'):20} → {t.get('score', 0):.2%}")
                else:
                    print(f"  {t:20} → (no score)")
        
        # Test round-trip
        if result['query']:
            print(f"\n{C.H}=== ROUND-TRIP TEST ==={C.R}")
            print(f"{C.D}Testing: Query → Text → Query{C.R}\n")
            
            forward = self.engine.query(result['query'], length=len(arg.split()), 
                                       use_synsets=True, use_relations=False)
            if forward:
                print(f"{C.C}Forward generated:{C.R} {forward['generated']}")
                print(f"{C.D}Similarity check would go here...{C.R}")
    
    def do_selflabel(self, arg):
        """Self-supervised learning: Label text samples. Usage: selflabel <file>
        
        Given a file with text samples (one per line), this will:
        1. Reverse-engineer the query for each sample
        2. Create (query, text) training pairs
        3. Display the self-labeled dataset
        
        This is SELF-SUPERVISED LEARNING - no external labels needed!
        """
        if not self.model_name:
            print(f"{C.W}Load a model first.{C.R}")
            return
        
        if not arg.strip():
            print(f"{C.W}Usage: selflabel <file>{C.R}")
            return
        
        filepath = arg.strip()
        if not os.path.exists(filepath):
            print(f"{C.F}File not found: {filepath}{C.R}")
            return
        
        # Load samples
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            samples = [line.strip() for line in f if line.strip()]
        
        print(f"{C.H}=== SELF-SUPERVISED LABELING ==={C.R}")
        print(f"{C.D}Loaded {len(samples)} samples from {filepath}{C.R}\n")
        
        t0 = time.time()
        labeled = self.engine.self_label(samples)
        elapsed = time.time() - t0
        
        print(f"\n{C.H}=== RESULTS ==={C.R}")
        print(f"{C.G}Labeled: {len(labeled)}/{len(samples)} samples{C.R}")
        print(f"{C.D}Time: {elapsed:.2f}s ({elapsed/len(samples)*1000:.1f}ms per sample){C.R}")
        
        # Show some examples
        print(f"\n{C.C}Sample labeled pairs:{C.R}")
        for i, (query, text, conf) in enumerate(labeled[:10]):
            print(f"{C.D}{i+1}.{C.R} \"{query}\" → {text[:50]}... ({conf:.2%})")
        
        if len(labeled) > 10:
            print(f"{C.D}   ... and {len(labeled)-10} more{C.R}")
        
        # Save option
        print(f"\n{C.C}Save labeled dataset? (y/n):{C.R} ", end='')
        if input().lower().startswith('y'):
            output_path = filepath.replace('.txt', '_labeled.json')
            with open(output_path, 'w') as f:
                json.dump([{'query': q, 'text': t, 'confidence': c} 
                          for q, t, c in labeled], f, indent=2)
            print(f"{C.G}Saved to: {output_path}{C.R}")

    def _relation_judgment(self, teacher_start_pos, vessel_start_pos, teacher_len=1, vessel_len=1):
        """Compare relations from teacher and vessel responses and adjust relation scores.

        teacher_start_pos and vessel_start_pos should be token start positions (ints).
        Relations are taken from self.engine.relation_dict.triples and are tuples
        of (subject, predicate, object, position).
        """
        if not hasattr(self.engine, 'relation_dict') or not self.engine.relation_dict:
            return None

        # Use position-aware extraction: only relations within the provided
        # token ranges are considered for judgment (prevents comparing whole history)
        teacher_rels = getattr(self.engine, 'get_relations_in_segment', lambda s, l: [])(int(teacher_start_pos), int(teacher_len))
        vessel_rels = getattr(self.engine, 'get_relations_in_segment', lambda s, l: [])(int(vessel_start_pos), int(vessel_len))

        overlap = 0
        for v_rel in vessel_rels:
            for t_rel in teacher_rels:
                if v_rel[1] == t_rel[1] and v_rel[2].lower() == t_rel[2].lower():
                    overlap += 1

        confidence = overlap / max(len(vessel_rels), 1)

        if confidence > 0.5:
            # YES: boost vessel relations
            for rel in vessel_rels:
                key = (rel[0].lower(), rel[1], rel[2].lower())
                if key not in self.engine.relation_dict.relation_scores:
                    self.engine.relation_dict.relation_scores[key] = 1.0
                self.engine.relation_dict.relation_scores[key] *= 1.2
            print(f"{C.G}[Judgment: Yes, {confidence:.0%} relation overlap]{C.R}")
        else:
            # NO: suppress vessel relations and learn teacher's
            for rel in vessel_rels:
                key = (rel[0].lower(), rel[1], rel[2].lower())
                if key not in self.engine.relation_dict.relation_scores:
                    self.engine.relation_dict.relation_scores[key] = 1.0
                self.engine.relation_dict.relation_scores[key] *= 0.8
            for rel in teacher_rels:
                key = (rel[0].lower(), rel[1], rel[2].lower())
                self.engine.relation_dict.relation_scores[key] = max(self.engine.relation_dict.relation_scores.get(key, 0.0), 1.0)
            print(f"{C.W}[Judgment: No, {confidence:.0%} relation overlap]{C.R}")
        # Relation-based judgment has been deprecated; reverse_interfere + ingest
        # already handle corrections and graph updates. This method is retained
        # for historical reasons but should not be invoked.
        return None
    
    def do_exit(self, arg):
        """Exit the shell."""
        if self.model_name:
            self.do_save("")
        print(f"{C.G}Goodbye.{C.R}")
        return True
    
    def do_quit(self, arg):
        """Exit the shell."""
        return self.do_exit(arg)
    
    def default(self, line):
        """Default: treat as query."""
        if not self.model_name:
            print(f"{C.W}Load a model first. Type 'help' for commands.{C.R}")
            return
        
        t0 = time.time()
        result = self.engine.query(
            line, 
            length=40, 
            window=25,
            use_synsets=self.synset_mode,
            use_relations=self.relations_mode
        )
        elapsed = (time.time() - t0) * 1000
        
        if result:
            if self.trace_mode:
                print(f"{C.D}[{result['hits']} hits @ {result['position']}, score:{result['score']:.2f}, {elapsed:.1f}ms]{C.R}")
            print(f"{C.G}>>>{C.R} {result['generated']}")
        else:
            print(f"{C.W}[No matches found]{C.R}")


if __name__ == "__main__":
    import sys
    shell = WordShell()
    if len(sys.argv) > 1:
        shell.do_load(sys.argv[1])
    shell.cmdloop()
