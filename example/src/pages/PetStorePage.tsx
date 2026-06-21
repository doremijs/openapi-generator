import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequest } from '@doremijs/o2t/client/react'
import { client } from '../api'
import type { OpenAPIComponents } from '../api/schema'
import './PetStorePage.css'

type Pet = OpenAPIComponents['schemas']['Pet']

const statusLabels: Record<string, string> = {
  available: '可购买',
  pending: '预订中',
  sold: '已售出'
}

const PAGE_SIZE = 12

export function PetStorePage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string>('available')
  const [petIdInput, setPetIdInput] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const { data: pets = [], loading, run: fetchPets } = useRequest(
    async (status?: string) => {
      const result = await client.get('/pet/findByStatus', {
        query: { status: [status || 'available'] }
      })
      if (!result.error) return result.data
      return []
    }
  )

  const [searchResult, setSearchResult] = useState<Pet[] | null>(null)

  const { loading: searchLoading, run: fetchPetById } = useRequest(
    async (id: number) => {
      const result = await client.get('/pet/{petId}', {
        params: { petId: id }
      })
      if (!result.error) return result.data ? [result.data] : []
      return []
    },
    { manual: true, onSuccess: (data) => setSearchResult(data) }
  )

  const { data: inventory } = useRequest(
    async () => {
      const result = await client.get('/store/inventory')
      if (!result.error) return result.data
      return null
    }
  )

  const displayPets = searchResult ?? pets
  const isLoading = loading || searchLoading

  const handleStatusChange = (status: string) => {
    setStatusFilter(status)
    setCurrentPage(1)
    setSearchResult(null)
    fetchPets(status || undefined)
  }

  const handleSearchById = () => {
    const id = parseInt(petIdInput)
    if (!isNaN(id) && id > 0) {
      setCurrentPage(1)
      fetchPetById(id)
    }
  }

  const handleReset = () => {
    setStatusFilter('available')
    setCurrentPage(1)
    setSearchResult(null)
    fetchPets()
  }

  // 计算分页数据
  const totalPages = Math.ceil(displayPets.length / PAGE_SIZE)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const currentPets = displayPets.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      handlePageChange(currentPage + 1)
    }
  }

  return (
    <div className="petstore-page">
      <header className="page-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← 返回
        </button>
        <h1>PetStore API 演示</h1>
      </header>

      <section className="controls">
        <div className="control-group">
          <label>状态筛选:</label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="available">可购买</option>
            <option value="pending">预订中</option>
            <option value="sold">已售出</option>
          </select>
        </div>

        <div className="control-group">
          <label>ID 查询:</label>
          <input
            type="number"
            value={petIdInput}
            onChange={(e) => setPetIdInput(e.target.value)}
            placeholder="输入宠物 ID"
          />
          <button onClick={handleSearchById} disabled={!petIdInput}>
            查询
          </button>
        </div>

        <button className="secondary-button" onClick={handleReset}>
          重置列表
        </button>
      </section>

      {isLoading ? (
        <div className="empty-state">加载中...</div>
      ) : displayPets.length > 0 ? (
        <>
          <div className="pets-grid">
            {currentPets.map((pet) => (
            <div key={pet.id} className="pet-card">
              <div className="pet-header">
                <span className="pet-id">ID: {pet.id}</span>
                <span className={`pet-status pet-status-${pet.status || 'pending'}`}>
                  {statusLabels[pet.status || ''] || '未设置'}
                </span>
              </div>
              <h3 className="pet-name">{pet.name}</h3>
              <p className="pet-category">{pet.category?.name || '未分类'}</p>
              {pet.tags && pet.tags.length > 0 && (
                <div className="pet-tags">
                  {pet.tags.map((tag: NonNullable<Pet['tags']>[number]) => (
                    <span key={tag.id} className="tag">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
              {pet.photoUrls && pet.photoUrls.length > 0 && (
                <div className="pet-photos">
                  {pet.photoUrls.slice(0, 4).map((url: string, index: number) => (
                    <img
                      key={index}
                      src={url}
                      alt={`${pet.name} photo ${index + 1}`}
                      className="pet-photo"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="pagination-button"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
            >
              ← 上一页
            </button>

            <div className="pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // 显示当前页附近的页码
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </button>
                  )
                } else if (
                  page === currentPage - 2 ||
                  page === currentPage + 2
                ) {
                  return <span key={page} className="pagination-ellipsis">...</span>
                }
                return null
              })}
            </div>

            <button
              className="pagination-button"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              下一页 →
            </button>
          </div>
        )}

        <div className="pagination-info">
          显示 {startIndex + 1} - {Math.min(endIndex, displayPets.length)} 条，共 {displayPets.length} 条
        </div>
      </>
      ) : (
        <div className="empty-state">暂无数据</div>
      )}

      {inventory && (
        <section className="info-section">
          <h2>库存概览</h2>
          <div className="api-endpoints">
            <div className="endpoint">
              <code>GET /store/inventory</code>
              <p>返回每种状态的宠物数量</p>
            </div>
          </div>
        </section>
      )}

      <section className="code-section">
        <h2>代码示例</h2>
        <pre className="code-block">{'// 使用 o2t 生成的类型安全客户端\nimport { createFetchClient } from \'@doremijs/o2t/client/fetch\'\n\nconst client = createFetchClient({\n  requestInterceptor: async (request) => {\n    request.url = \'https://petstore.swagger.io/v2\' + request.url\n    return request\n  }\n})\n\n// 按状态查询宠物\nconst result = await client.get(\'/pet/findByStatus\', {\n  query: { status: \'available\' }\n})\n\nif (!result.error) {\n  console.log(result.data) // 类型安全的 Pet[]\n}'}</pre>
      </section>
    </div>
  )
}
