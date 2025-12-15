import { FunctionDeclaration, Type } from '@google/genai';

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'writeFile',
    description: 'Writes content to a new file or overwrites an existing file in the project.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filename: {
          type: Type.STRING,
          description: 'The name of the file to write, including the extension (e.g., "main.rs", "utils.py").',
        },
        content: {
          type: Type.STRING,
          description: 'The content to write to the file.',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'memorySearch',
    description: 'Searches the full conversation history for messages containing specific keywords. Use this to recall past information or events when asked a question you cannot answer from recent context.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keywords: {
          type: Type.ARRAY,
          description: 'An array of keywords to search for. The search will find messages that contain ALL provided keywords.',
          items: {
            type: Type.STRING,
          },
        },
      },
      required: ['keywords'],
    },
  },
];