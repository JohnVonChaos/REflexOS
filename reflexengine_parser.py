#!/usr/bin/env python3
"""
Reflexengine Message Parser

Parses exported Reflexengine JSON sessions and formats them as:
user_input
subconscious_output
conscious_output
synthesis_output

With empty lines between turns.

Usage:
    python reflexengine_parser.py <session_file.json>
    python reflexengine_parser.py <session_file.json> --output parsed_messages.txt
"""

import json
import argparse
import sys
from typing import List, Dict, Any, Optional

def clean_text(text: str) -> str:
    """Clean text by removing extra whitespace and newlines for single-line format"""
    if not text:
        return ""
    # Replace newlines and multiple spaces with single space
    cleaned = ' '.join(text.split())
    # Remove any remaining special characters that might break formatting
    cleaned = cleaned.replace('\t', ' ')
    return cleaned.strip()

def extract_cognitive_steps(message: Dict[str, Any]) -> Dict[str, str]:
    """Extract cognitive steps from a message atom"""
    steps = {
        'subconscious': '',
        'conscious': '',
        'synthesis': ''
    }
    
    # Debug: Print message structure
    if 'cognitiveTrace' in message and message['cognitiveTrace']:
        print(f"DEBUG: Found cognitiveTrace with {len(message['cognitiveTrace'])} items", file=sys.stderr)
        for i, trace in enumerate(message['cognitiveTrace']):
            print(f"  Trace {i}: type='{trace.get('type')}', text_length={len(trace.get('text', ''))}", file=sys.stderr)
    
    # Check if this message has cognitiveTurnDetails (newer format)
    if 'cognitiveTurnDetails' in message and message['cognitiveTurnDetails']:
        details = message['cognitiveTurnDetails']
        steps['subconscious'] = clean_text(details.get('subconsciousText', ''))
        steps['conscious'] = clean_text(details.get('consciousText', ''))
        steps['synthesis'] = clean_text(details.get('synthesisText', ''))
        print(f"DEBUG: cognitiveTurnDetails format found", file=sys.stderr)
    
    # Check cognitiveTrace array (alternative format)
    elif 'cognitiveTrace' in message and message['cognitiveTrace']:
        for trace in message['cognitiveTrace']:
            trace_type = trace.get('type', '')
            trace_text = trace.get('text', '')
            
            if trace_type == 'subconscious_reflection':
                steps['subconscious'] = clean_text(trace_text)
                print(f"DEBUG: Found subconscious: {len(trace_text)} chars", file=sys.stderr)
            elif trace_type == 'conscious_thought':
                steps['conscious'] = clean_text(trace_text)
                print(f"DEBUG: Found conscious: {len(trace_text)} chars", file=sys.stderr)
            elif trace_type == 'model_response':
                # Sometimes synthesis is stored as model_response in trace
                if not steps['synthesis']:
                    steps['synthesis'] = clean_text(trace_text)
                    print(f"DEBUG: Found synthesis from trace: {len(trace_text)} chars", file=sys.stderr)
    
    # If synthesis is still empty, use the main message text for model responses
    if not steps['synthesis'] and message.get('role') == 'model' and message.get('type') == 'model_response':
        steps['synthesis'] = clean_text(message.get('text', ''))
        print(f"DEBUG: Using main message text for synthesis: {len(message.get('text', ''))} chars", file=sys.stderr)
    
    print(f"DEBUG: Final steps - sub:{len(steps['subconscious'])}, con:{len(steps['conscious'])}, syn:{len(steps['synthesis'])}", file=sys.stderr)
    return steps

def find_conversation_pairs(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Find user-model conversation pairs and extract cognitive steps"""
    pairs = []
    
    for i, message in enumerate(messages):
        if (message.get('role') == 'user' and 
            message.get('type') == 'user_message' and
            i + 1 < len(messages)):
            
            user_input = clean_text(message['text'])
            
            # Look for the next model response
            for j in range(i + 1, len(messages)):
                next_msg = messages[j]
                if (next_msg.get('role') == 'model' and 
                    next_msg.get('type') == 'model_response'):
                    
                    cognitive_steps = extract_cognitive_steps(next_msg)
                    
                    pair = {
                        'user_input': user_input,
                        'subconscious': cognitive_steps['subconscious'],
                        'conscious': cognitive_steps['conscious'],
                        'synthesis': cognitive_steps['synthesis']
                    }
                    
                    pairs.append(pair)
                    break  # Found the matching response, move to next user message
    
    return pairs

def format_output_lines(pair: Dict[str, str]) -> str:
    """Format a conversation pair as multiple lines for training data, one component per line"""
    lines = []
    
    # Always include user input
    if pair['user_input']:
        lines.append(pair['user_input'])
    
    # Add cognitive steps only if they exist and are different
    if pair['subconscious'] and pair['subconscious'] != pair['user_input']:
        lines.append(pair['subconscious'])
    
    if pair['conscious'] and pair['conscious'] != pair['subconscious'] and pair['conscious'] != pair['user_input']:
        lines.append(pair['conscious'])
    
    if pair['synthesis'] and pair['synthesis'] != pair['conscious'] and pair['synthesis'] != pair['subconscious']:
        lines.append(pair['synthesis'])
    
    # Join with newlines
    return '\n'.join(lines)

def parse_session_file(file_path: str) -> List[str]:
    """Parse a Reflexengine session JSON file and return formatted lines"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            session_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.", file=sys.stderr)
        return []
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in '{file_path}': {e}", file=sys.stderr)
        return []
    
    # Extract messages from session data
    messages = []
    if isinstance(session_data, dict):
        if 'messages' in session_data:
            messages = session_data['messages']
        elif 'data' in session_data and 'messages' in session_data['data']:
            messages = session_data['data']['messages']
    elif isinstance(session_data, list):
        messages = session_data
    
    if not messages:
        print("Warning: No messages found in the session file.", file=sys.stderr)
        return []
    
    # Find conversation pairs and format them
    pairs = find_conversation_pairs(messages)
    
    if not pairs:
        print("Warning: No user-model conversation pairs found.", file=sys.stderr)
        return []
    
    # Format each pair as multiple lines
    return [format_output_lines(pair) for pair in pairs]

def main():
    parser = argparse.ArgumentParser(description='Parse Reflexengine session files')
    parser.add_argument('session_file', help='Path to the JSON session file')
    parser.add_argument('--output', '-o', help='Output file path (default: stdout)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        print(f"Parsing session file: {args.session_file}", file=sys.stderr)
    
    formatted_lines = parse_session_file(args.session_file)
    
    if not formatted_lines:
        sys.exit(1)
    
    if args.verbose:
        print(f"Found {len(formatted_lines)} conversation pairs", file=sys.stderr)
    
    # Output results
    if args.output:
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                for i, multi_line in enumerate(formatted_lines):
                    for line in multi_line.split('\n'):
                        if line.strip():  # Only write non-empty lines
                            f.write(line + '\n')
                    if i < len(formatted_lines) - 1:  # Don't add empty line after last entry
                        f.write('\n')  # Add empty line between entries
            if args.verbose:
                print(f"Output written to: {args.output}", file=sys.stderr)
        except IOError as e:
            print(f"Error writing to file '{args.output}': {e}", file=sys.stderr)
            sys.exit(1)
    else:
        for i, multi_line in enumerate(formatted_lines):
            for line in multi_line.split('\n'):
                if line.strip():  # Only print non-empty lines
                    print(line)
            if i < len(formatted_lines) - 1:  # Don't add empty line after last entry
                print()  # Add empty line between entries

if __name__ == '__main__':
    main()