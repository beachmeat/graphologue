import React, { createContext } from 'react'
import { QuestionAndAnswer } from '../App'
import { LLMProvider } from '../utils/llmProvider'

export interface ChatContextType {
  questionsAndAnswersCount: number
  setQuestionsAndAnswers: React.Dispatch<
    React.SetStateAction<QuestionAndAnswer[]>
  >
  llmProvider: LLMProvider | null
}

export const ChatContext = createContext<ChatContextType>({
  questionsAndAnswersCount: 0,
  setQuestionsAndAnswers: () => {},
  llmProvider: null,
})
