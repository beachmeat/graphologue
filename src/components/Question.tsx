import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded'
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded'
import ClearRoundedIcon from '@mui/icons-material/ClearRounded'

import { AnswerObject } from '../App'
import { ChatContext } from './Contexts'
import {
  getTextFromModelResponse,
  getTextFromStreamResponse,
  models,
  OpenAIChatCompletionResponseStream,
  parseOpenAIResponseToObjects,
  streamOpenAICompletion,
} from '../utils/openAI'
import {
  predefinedPrompts,
  predefinedPromptsForParsing,
} from '../utils/prompts'
import {
  getAnswerObjectId,
  helpSetQuestionAndAnswer,
  newQuestionAndAnswer,
  trimLineBreaks,
} from '../utils/chatUtils'
import { InterchangeContext } from './Interchange'
import { SentenceParser, SentenceParsingJob } from '../utils/sentenceParser'
import {
  cleanSlideResponse,
  nodeIndividualsToNodeEntities,
  parseEdges,
  parseNodes,
  RelationshipSaliency,
  removeAnnotations,
  removeLastBracket,
} from '../utils/responseProcessing'
import { ListDisplayFormat } from './Answer'
import { debug, LLM_PROVIDER } from '../constants'
import { LLMProvider } from '../utils/llmProvider'

export type FinishedAnswerObjectParsingTypes = 'summary' | 'slide'

export const Question = () => {
  const { questionsAndAnswersCount, setQuestionsAndAnswers, llmProvider } =
    useContext(ChatContext)
  const {
    questionAndAnswer: {
      id,
      question,
      answer,
      modelStatus: { modelAnswering, modelError },
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleSelfCorrection,
  } = useContext(InterchangeContext)

  const [activated, setActivated] = useState(false) // show text box or not
  const questionItemRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!activated && (questionsAndAnswersCount < 2 || answer.length > 0)) {
      setActivated(true)
    }
  }, [activated, answer.length, questionsAndAnswersCount])

  /* -------------------------------------------------------------------------- */

  const canAsk = question.length > 0 && !modelAnswering && llmProvider

  /* -------------------------------------------------------------------------- */

  const autoGrow = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'fit-content'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [])

  const handleChange = useCallback(
    (event: ChangeEvent) => {
      if (event.target instanceof HTMLTextAreaElement) {
        const newQuestion = event.target.value

        setQuestionsAndAnswers(prevQsAndAs =>
          helpSetQuestionAndAnswer(prevQsAndAs, id, {
            question: newQuestion,
          }),
        )

        autoGrow()
      }
    },
    [autoGrow, id, setQuestionsAndAnswers],
  )

  useEffect(() => {
    autoGrow()
  }, [autoGrow])

  /* -------------------------------------------------------------------------- */

  // ! smart part
  const answerStorage = useRef<{
    answer: string
    answerObjects: AnswerObject[]
  }>({
    answer: '', // raw uncleaned text
    answerObjects: [],
  })

  const handleResponseError = useCallback(
    (response: any) => {
      console.error(response.error)

      setQuestionsAndAnswers(prevQsAndAs =>
        helpSetQuestionAndAnswer(prevQsAndAs, id, {
          // answerObjects: [], // ?
          modelStatus: {
            modelError: true,
          },
        }),
      )
    },
    [id, setQuestionsAndAnswers],
  )

  const handleSentenceParsingResult = useCallback(
    (result: SentenceParsingJob) => {
      const { sourceAnswerObjectId } = result

      const sourceAnswerObject = answerStorage.current.answerObjects.find(
        answerObject => answerObject.id === sourceAnswerObjectId,
      )
      if (!sourceAnswerObject || sourceAnswerObject.complete)
        // do not touch complete answer objects
        return

      answerStorage.current.answerObjects =
        answerStorage.current.answerObjects.map((a: AnswerObject) => {
          if (a.id === sourceAnswerObjectId) {
            return {
              ...a,
              complete: true,
            }
          } else return a
        })

      setQuestionsAndAnswers(prevQsAndAs =>
        helpSetQuestionAndAnswer(prevQsAndAs, id, {
          answerObjects: answerStorage.current.answerObjects,
        }),
      )
    },
    [id, setQuestionsAndAnswers],
  )

  const sentenceParser = useRef<SentenceParser>(
    new SentenceParser(handleSentenceParsingResult, handleResponseError),
  )

  /* -------------------------------------------------------------------------- */
  // ! stream graph

  const _groundRest = useCallback(() => {
    setQuestionsAndAnswers(prevQsAndAs =>
      helpSetQuestionAndAnswer(
        prevQsAndAs,
        id,
        newQuestionAndAnswer({
          id,
          question,
          modelStatus: {
            modelAnswering: true,
            modelParsing: true, // parsing starts the same time as answering
          },
        }),
      ),
    )
    answerStorage.current.answer = ''
    answerStorage.current.answerObjects = []

    sentenceParser.current.reset() // ? still needed?

    textareaRef.current?.blur()

    // scroll to the question item (questionItemRef)
    setTimeout(() => {
      const answerWrapper = document.querySelector(
        `.answer-wrapper[data-id="${id}"]`,
      )
      if (answerWrapper)
        answerWrapper.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        })
    }, 1000)
  }, [id, question, setQuestionsAndAnswers])

  /* -------------------------------------------------------------------------- */

  const handleUpdateRelationshipEntities = useCallback(
    (content: string, answerObjectId: string) => {
      const answerObject = answerStorage.current.answerObjects.find(
        a => a.id === answerObjectId,
      )
      if (!answerObject) return

      const cleanedContent = removeLastBracket(content, true)
      const nodes = parseNodes(cleanedContent, answerObjectId)
      const edges = parseEdges(cleanedContent, answerObjectId)

      answerStorage.current.answerObjects =
        answerStorage.current.answerObjects.map(
          (a: AnswerObject): AnswerObject => {
            if (a.id === answerObjectId) {
              return {
                ...a,
                originText: {
                  ...a.originText,
                  nodeEntities: nodeIndividualsToNodeEntities(nodes),
                  edgeEntities: edges,
                },
              }
            } else return a
          },
        )
    },
    [],
  )

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey && canAsk) {
        event.preventDefault()

        _groundRest()

        // ! stream graph
        const prompts = predefinedPrompts.initialAsk(question)

        try {
          await llmProvider.streamCompletion(
            prompts,
            LLM_PROVIDER.models.smarter,
            (
              data: OpenAIChatCompletionResponseStream,
              freshStream: boolean,
            ) => {
              const content = getTextFromStreamResponse(data)
              if (content) {
                answerStorage.current.answer += content
                setQuestionsAndAnswers(prevQsAndAs =>
                  helpSetQuestionAndAnswer(prevQsAndAs, id, {
                    answer: answerStorage.current.answer,
                  }),
                )
              }
            },
            true,
          )

          // ! parse graph
          const answerObjectId = getAnswerObjectId()
          const answerObject = {
            id: answerObjectId,
            originText: {
              content: answerStorage.current.answer,
              nodeEntities: [],
              edgeEntities: [],
            },
            summary: {
              content: '',
              nodeEntities: [],
              edgeEntities: [],
            },
            slide: {
              content: '',
            },
            answerObjectSynced: {
              listDisplay: 'text' as ListDisplayFormat,
              saliencyFilter: 'high' as RelationshipSaliency,
              collapsedNodes: [],
              sentencesBeingCorrected: [],
            },
            complete: false,
          }

          answerStorage.current.answerObjects.push(answerObject)

          setQuestionsAndAnswers(prevQsAndAs =>
            helpSetQuestionAndAnswer(prevQsAndAs, id, {
              answerObjects: answerStorage.current.answerObjects,
              modelStatus: {
                modelAnswering: false,
                modelParsing: true,
                modelAnsweringComplete: true,
                modelParsingComplete: false,
                modelError: false,
                modelInitialPrompts: prompts,
              },
            }),
          )

          // ! parse graph
          const parsingPrompts = predefinedPrompts.initialAsk(
            answerStorage.current.answer,
          )

          try {
            const parsingResponse = await llmProvider.getCompletion(
              parsingPrompts,
              LLM_PROVIDER.models.smarter,
            )

            const parsingText = getTextFromModelResponse(parsingResponse)
            if (parsingText) {
              const cleanedContent = removeAnnotations(parsingText)
              handleUpdateRelationshipEntities(cleanedContent, answerObjectId)

              setQuestionsAndAnswers(prevQsAndAs =>
                helpSetQuestionAndAnswer(prevQsAndAs, id, {
                  answerObjects: answerStorage.current.answerObjects,
                  modelStatus: {
                    modelAnswering: false,
                    modelParsing: false,
                    modelAnsweringComplete: true,
                    modelParsingComplete: true,
                    modelError: false,
                    modelInitialPrompts: prompts,
                  },
                }),
              )
            }
          } catch (error) {
            handleResponseError(error)
          }
        } catch (error) {
          handleResponseError(error)
        }
      }
    },
    [
      canAsk,
      handleResponseError,
      handleUpdateRelationshipEntities,
      id,
      llmProvider,
      question,
      setQuestionsAndAnswers,
      _groundRest,
    ],
  )

  return (
    <div className="question-item" ref={questionItemRef}>
      <textarea
        ref={textareaRef}
        className="question-textarea"
        placeholder="Ask a question"
        rows={1}
        value={question}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={!llmProvider}
      />
      {modelAnswering && (
        <div className="question-item-loading">
          <HourglassTopRoundedIcon />
        </div>
      )}
      {modelError && (
        <div className="question-item-error">
          <ClearRoundedIcon />
        </div>
      )}
      {!modelAnswering && !modelError && canAsk && (
        <div className="question-item-send">
          <AutoFixHighRoundedIcon />
        </div>
      )}
    </div>
  )
}
