import { Routes, Route, useNavigate } from 'react-router-dom'
import { PetStorePage } from './pages/PetStorePage'
import { ChatPage } from './pages/ChatPage'
import { Diamond, Mic, Terminal, Zap, Waves, Circle, ArrowLeftRight } from 'lucide-react'
import './App.css'

function App() {
  const navigate = useNavigate()

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={
          <div className="home-page">
            <header className="home-header">
              <h1>
                <span>@doremijs/o2t</span>
              </h1>
              <p>
                OpenAPI 规范到 TypeScript 类型安全客户端的优雅转换
              </p>
            </header>

            <main>
              <section className="example-section">
                <h2>探索示例</h2>
                <div className="example-cards">
                  <button
                    onClick={() => navigate('/petstore')}
                    className="example-card"
                  >
                    <div className="card-icon"><Diamond size={40} /></div>
                    <h3>PetStore API</h3>
                    <p>基于 OpenAPI 规范生成的类型安全客户端，展示完整的数据获取与类型推断能力</p>
                    <ul className="card-features">
                      <li>按状态查询宠物列表</li>
                      <li>通过 ID 获取单个宠物</li>
                      <li>查看商店库存信息</li>
                      <li>完整的 TypeScript 类型定义</li>
                    </ul>
                  </button>

                  <button
                    onClick={() => navigate('/chat')}
                    className="example-card"
                  >
                    <div className="card-icon"><Mic size={40} /></div>
                    <h3>AI 流式对话</h3>
                    <p>Server-Sent Events 实时流式响应演示，展示流式数据处理的优雅实现</p>
                    <ul className="card-features">
                      <li>SSE 实时流式输出</li>
                      <li>会话历史持久化管理</li>
                      <li>生成过程中的中断控制</li>
                      <li>完善的状态追踪机制</li>
                    </ul>
                  </button>
                </div>
              </section>

              <section className="features-section">
                <h2>核心特性</h2>
                <div className="features-grid">
                  <div className="feature-item">
                    <div className="feature-icon"><Terminal size={28} /></div>
                    <h3>类型安全</h3>
                    <p>从 OpenAPI 规范自动生成 TypeScript 类型，在编译期捕获错误</p>
                  </div>
                  <div className="feature-item">
                    <div className="feature-icon"><Zap size={28} /></div>
                    <h3>轻量设计</h3>
                    <p>零运行时依赖，仅包含必要的类型定义与工具函数</p>
                  </div>
                  <div className="feature-item">
                    <div className="feature-icon"><Waves size={28} /></div>
                    <h3>流式支持</h3>
                    <p>内置 SSE 流式处理能力，适配 AI 对话等实时场景</p>
                  </div>
                  <div className="feature-item">
                    <div className="feature-icon"><Circle size={28} /></div>
                    <h3>Tree-shaking</h3>
                    <p>模块化导出设计，按需引入，优化最终打包体积</p>
                  </div>
                  <div className="feature-item">
                    <div className="feature-icon"><Terminal size={28} /></div>
                    <h3>函数式设计</h3>
                    <p>纯函数实现，无副作用，易于测试与组合</p>
                  </div>
                  <div className="feature-item">
                    <div className="feature-icon"><ArrowLeftRight size={28} /></div>
                    <h3>平台无关</h3>
                    <p>支持浏览器、Node.js、小程序等多种运行环境</p>
                  </div>
                </div>
              </section>

              <section className="code-section">
                <h2>快速开始</h2>
                <div className="code-example">
                  <code>{`# 安装依赖
bun add @doremijs/o2t

# 生成代码
npx o2t init
npx o2t generate typescript

# 在代码中使用
import { createFetchClient } from '@doremijs/o2t/client/fetch'
import { useStreamChat } from '@doremijs/o2t/client/react'`}</code>
                </div>
              </section>
            </main>

            <footer className="home-footer">
              <a href="https://github.com/doremijs/o2t" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              <span className="separator">·</span>
              <a href="https://www.npmjs.com/package/@doremijs/o2t" target="_blank" rel="noopener noreferrer">
                npm
              </a>
            </footer>
          </div>
        } />

        <Route path="/petstore" element={<PetStorePage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </div>
  )
}

export default App
