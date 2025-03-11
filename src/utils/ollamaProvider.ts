import { LLMProvider, Prompt, LLMConfig } from './llmProvider'

export class OllamaProvider implements LLMProvider {
  private config: LLMConfig
  private baseUrl: string

  constructor(config: LLMConfig) {
    this.config = config
    this.baseUrl = config.baseUrl || 'http://localhost:11434'
  }

  async getCompletion(
    prompts: Prompt[],
    model: string,
    temperature: number = 0.7,
    maxTokens: number = 1024,
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: prompts,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: maxTokens,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`)
    }

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
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: prompts,
        stream: true,
        options: {
          temperature: temperature,
          num_predict: maxTokens,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) return

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder().decode(value)
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          streamFunction(data, freshStream)
        } catch (error) {
          console.error('Error parsing stream data:', error)
        }
      }
    }
  }
}
