export interface LLMProvider {
  getCompletion: (
    prompts: Prompt[],
    model: string,
    temperature?: number,
    maxTokens?: number,
  ) => Promise<any>

  streamCompletion: (
    prompts: Prompt[],
    model: string,
    streamFunction: (data: any, freshStream: boolean) => void,
    freshStream: boolean,
    temperature?: number,
    maxTokens?: number,
  ) => Promise<void>
}

export interface Prompt {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMConfig {
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
}
