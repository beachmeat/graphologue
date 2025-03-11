import { LLMProvider, LLMConfig } from './llmProvider'
import { OllamaProvider } from './ollamaProvider'
import { OpenAIProvider } from './openAIProvider'

export function createLLMProvider(
  type: string,
  config: LLMConfig,
): LLMProvider {
  switch (type.toLowerCase()) {
    case 'ollama':
      return new OllamaProvider(config)
    case 'openai':
      return new OpenAIProvider(config)
    default:
      throw new Error(`Unsupported LLM provider type: ${type}`)
  }
}
