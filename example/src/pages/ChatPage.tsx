/**
 * AI Chat Demo Page with Streaming
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFetchClient } from '@doremijs/o2t/client'
import { useStreamChat } from '@doremijs/o2t/client/react'
import { Plus, Trash2, User, Bot, StopCircle, Send, Lightbulb, Waves, Database, PauseCircle, RotateCcw, ArrowLeft } from 'lucide-react'
import './ChatPage.css'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

type GLMChunk = {
  choices?: Array<{
    delta?: { content?: string }
  }>
}

const streamClient = createFetchClient({
  requestInterceptor(request) {
    request.url = 'https://api.x.ant.design' + request.url
    return request
  }
})

async function fetchHistorySessions(): Promise<ChatSession[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))

  const stored = localStorage.getItem('chat_sessions')
  if (stored) {
    return JSON.parse(stored)
  }

  return [
    {
      id: '1',
      title: '介绍 TypeScript',
      messages: [
        { id: '1-1', role: 'user', content: '什么是 TypeScript？', timestamp: Date.now() - 100000 },
        { id: '1-2', role: 'assistant', content: 'TypeScript 是 JavaScript 的超集，添加了静态类型检查。', timestamp: Date.now() - 90000 }
      ],
      createdAt: Date.now() - 100000
    },
    {
      id: '2',
      title: 'React Hooks',
      messages: [
        { id: '2-1', role: 'user', content: '什么是 React Hooks？', timestamp: Date.now() - 50000 },
        { id: '2-2', role: 'assistant', content: 'React Hooks 让你可以在函数组件中使用状态和其他 React 特性。', timestamp: Date.now() - 40000 }
      ],
      createdAt: Date.now() - 50000
    }
  ]
}

export function ChatPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentSessionRef = useRef<ChatSession | null>(null)
  const streamMessagesRef = useRef<ChatMessage[]>([])
  const responseMessageIdRef = useRef('')

  useEffect(() => {
    currentSessionRef.current = currentSession
  }, [currentSession])

  // 加载历史会话
  useEffect(() => {
    fetchHistorySessions().then(data => {
      setSessions(data)
      setLoadingSessions(false)
    })
  }, [])

  const { messages, isLoading, send, abort, clear } = useStreamChat<
    { message: string },
    ChatMessage,
    GLMChunk
  >({
    service: async (params, signal) => {
      const result = await streamClient.post('/api/big_model_glm-4.5-flash', {
        body: {
          stream: true,
          model: 'glm-4.5-flash',
          messages: [{
            type: 'text',
            role: 'user',
            content: params.message
          }]
        },
        signal
      })
      if (!result.error && result.response) return result.response
      throw new Error('Request failed')
    },
    refreshDeps: [currentSession?.id],
    defaultMessages: currentSession ? async () => currentSession.messages : undefined,
    localTransform: (params) => ({
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: params.message,
      timestamp: Date.now()
    }),
    streamTransform: ({ chunks }) => ({
      id: responseMessageIdRef.current,
      role: 'assistant' as const,
      content: chunks.map(c => c?.choices?.[0]?.delta?.content || '').join(''),
      timestamp: Date.now()
    }),
    onComplete: (finalData) => {
      const activeSession = currentSessionRef.current
      if (activeSession) {
        const userMessage = streamMessagesRef.current.find((message) =>
          message.role === 'user' && !activeSession.messages.some((savedMessage) => savedMessage.id === message.id)
        )
        const newMessages = [...activeSession.messages]
        if (userMessage) {
          newMessages.push(userMessage)
        }
        newMessages.push(finalData)
        const updatedSession = {
          ...activeSession,
          messages: newMessages
        }
        setCurrentSession(updatedSession)
        currentSessionRef.current = updatedSession
        saveSessions(updatedSession)
        clear()
      }
    },
    onFinishChat: () => {
      console.log('Chat finished')
    }
  })

  useEffect(() => {
    streamMessagesRef.current = messages.map((item) => item.data).filter((item): item is ChatMessage => Boolean(item))
  }, [messages])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages, messages])

  const saveSessions = (sessionToUpdate: ChatSession) => {
    setSessions(prev => {
      const index = prev.findIndex(s => s.id === sessionToUpdate.id)
      if (index >= 0) {
        const updated = [...prev]
        updated[index] = sessionToUpdate
        localStorage.setItem('chat_sessions', JSON.stringify(updated))
        return updated
      }
      return prev
    })
  }

  const handleSend = async (messageOverride?: string) => {
    const message = (messageOverride || inputValue).trim()
    if (!message) return

    setInputValue('')
    responseMessageIdRef.current = `response-${Date.now()}`

    // 如果没有当前会话，创建新会话
    if (!currentSession) {
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: message.slice(0, 20) + (message.length > 20 ? '...' : ''),
        messages: [],
        createdAt: Date.now()
      }
      setCurrentSession(newSession)
      currentSessionRef.current = newSession
      setSessions(prev => [newSession, ...prev])
    }

    await send({ message })
  }

  const handleSendWithMessage = async (message: string) => {
    await handleSend(message)
  }

  const handleNewChat = () => {
    setCurrentSession(null)
    setInputValue('')
  }

  const selectSession = (session: ChatSession) => {
    setCurrentSession(session)
  }

  const deleteSession = (sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId)
      localStorage.setItem('chat_sessions', JSON.stringify(updated))
      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
      }
      return updated
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-page">
      <header className="chat-header">
        <button onClick={() => navigate('/')} className="back-button">
          <ArrowLeft size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
          {' '}返回
        </button>
        <h1>AI 对话演示</h1>
        <button onClick={handleNewChat} className="new-chat-button">
          <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />
          {' '}新对话
        </button>
      </header>

      <div className="chat-container">
        {/* 侧边栏 - 历史会话 */}
        <aside className="chat-sidebar">
          <h2>历史会话</h2>
          {loadingSessions ? (
            <p className="loading">加载中...</p>
          ) : (
            <ul className="session-list">
              {sessions.map(session => (
                <li
                  key={session.id}
                  className={`session-item ${currentSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => selectSession(session)}
                >
                  <span className="session-title">{session.title}</span>
                  <button
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(session.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* 主聊天区域 */}
        <main className="chat-main">
          {/* 消息列表 */}
          <div className="messages-container">
            {!currentSession ? (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <h2>开始新对话</h2>
                  <p>点击下方问题或直接输入消息开始对话</p>
                  <div className="suggestions">
                    <button onClick={() => handleSendWithMessage('1+1 等于几？')}>
                      1+1 等于几？
                    </button>
                    <button onClick={() => handleSendWithMessage('写一首关于春天的诗')}>
                      写一首关于春天的诗
                    </button>
                    <button onClick={() => handleSendWithMessage('介绍 TypeScript')}>
                      介绍 TypeScript
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {currentSession.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message message-${message.role}`}
                  >
                    <div className="message-avatar">
                      {message.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="message-content">
                      <div className="message-text">{message.content}</div>
                      <div className="message-time">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}

                {/* 当前对话的消息 */}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message message-${msg.data.role} ${msg.status === 'loading' ? 'loading' : ''}`}
                  >
                    <div className="message-avatar">
                      {msg.data.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        {msg.data.content}
                        {msg.status === 'loading' && <span className="cursor">▊</span>}
                      </div>
                      {msg.status === 'aborted' && (
                        <div className="message-status">已中断</div>
                      )}
                    </div>
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入区域 */}
          <div className="input-area">
            {isLoading && (
              <button onClick={abort} className="abort-button">
                <StopCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                {' '}停止生成
              </button>
            )}
            <div className="input-wrapper">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={currentSession ? "输入消息... (Shift+Enter 换行)" : "输入消息开始新对话... (Shift+Enter 换行)"}
                className="message-input"
                rows={1}
                disabled={isLoading}
              />
              <button
                onClick={() => {
                  void handleSend()
                }}
                disabled={isLoading || !inputValue.trim()}
                className="send-button"
              >
                {isLoading ? <PauseCircle size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> : <Send size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />}
                {' '}{isLoading ? '生成中' : '发送'}
              </button>
            </div>
            <div className="input-hints">
              <small><Lightbulb size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> 提示：使用真实 AI API 进行流式响应</small>
            </div>
          </div>
        </main>
      </div>

      {/* 功能说明 */}
      <section className="features-section">
        <h2>功能特性</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Waves size={28} /></div>
            <h3>流式响应</h3>
            <p>使用 SSE (Server-Sent Events) 实现实时流式输出</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Database size={28} /></div>
            <h3>会话历史</h3>
            <p>自动保存对话历史，支持异步加载</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><PauseCircle size={28} /></div>
            <h3>中断控制</h3>
            <p>支持中断正在生成的响应</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><RotateCcw size={28} /></div>
            <h3>状态管理</h3>
            <p>完整的状态管理：加载中、成功、错误、中断</p>
          </div>
        </div>
      </section>

      <section className="code-section">
        <h2>代码示例</h2>
        <pre className="code-block">{`// 使用 React Hook 进行流式对话
import { createFetchClient } from '@doremijs/o2t/client'
import { useStreamChat } from '@doremijs/o2t/client/react'

const streamClient = createFetchClient({
  requestInterceptor(request) {
    request.url = 'https://api.example.com' + request.url
    return request
  }
})

const { messages, isLoading, send, abort } = useStreamChat({
  service: async (params, signal) => {
    const result = await streamClient.post('/api/chat', {
      body: params,
      signal
    })
    if (!result.error && result.response) return result.response
    throw new Error('Request failed')
  },
  localTransform: (params) => ({
    role: 'user',
    content: params.message
  }),
  streamTransform: ({ chunks }) => ({
    role: 'assistant',
    content: chunks.map(c => c?.choices?.[0]?.delta?.content || '').join('')
  })
})

// 发送消息
await send({ message: '你好' })

// 中断生成
abort()`}</pre>
      </section>
    </div>
  )
}
