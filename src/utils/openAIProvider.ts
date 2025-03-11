import { LLMProvider, Prompt, LLMConfig } from './llmProvider'

export class OpenAIProvider implements LLMProvider {
  private config: LLMConfig
  private baseUrl: string

  constructor(config: LLMConfig) {
    this.config = config
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1'
  }

  async getCompletion(
    prompts: Prompt[],
    model: string,
    temperature: number = 0.7,
    maxTokens: number = 1024,
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: prompts,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    })

    return await response.json()
  }

  async streamCompletion(
    prompts: Prompt[],
    model: string,
    streamFunction: (data: any, freshStream: boolean) => void,
    freshStream: boolean,
    temperature: number = 0.7,
    maxTokens: number = 2048,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: prompts,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    const reader = response.body?.getReader()
    if (!reader) return

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder().decode(value)
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            streamFunction(parsed, freshStream)
          } catch (error) {
            console.error('Error parsing stream data:', error)
          }
        }
      }
    }
  }
}
