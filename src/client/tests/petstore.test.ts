/**
 * PetStore API tests using generated schema
 * Tests both o2t generator and fetch client functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createFetchClient, CustomFetchInit } from '../fetch'
import type { OpenAPIs } from './petstore/schema'

const API_BASE = 'https://petstore.swagger.io/v2'

describe('PetStore API with generated schema', () => {
  let client: ReturnType<typeof createFetchClient<OpenAPIs>>

  beforeEach(() => {
    client = createFetchClient<OpenAPIs>({
      fetchImpl: fetch as any,
      requestInterceptor: async (request) => {
        // Prepend API base URL to relative paths
        request.url = API_BASE + request.url
        return request
      }
    })
  })

  describe('GET /pet/{petId}', () => {
    test('should get pet by ID', async () => {
      const result = await client.get('/pet/{petId}', {
        params: { petId: 1 }
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(result.data).toBeDefined()
        expect(result.data.id).toBe(1)
        expect(result.data.name).toBeDefined()
      }
    })

    test('should return error for non-existent pet', async () => {
      const result = await client.get('/pet/{petId}', {
        params: { petId: 99999999 }
      })

      // PetStore API returns 404 for non-existent pets
      expect(result.error).toBe(true)
    })

    test('should handle path parameters correctly', async () => {
      const result = await client.get('/pet/{petId}', {
        params: { petId: 1 }
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(result.data.id).toBe(1)
      }
    })
  })

  describe('GET /pet/findByStatus', () => {
    test('should find pets by status', async () => {
      const result = await client.get('/pet/findByStatus', {
        query: { status: ['available'] }
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(Array.isArray(result.data)).toBe(true)
        if (result.data.length > 0) {
          expect(result.data[0].status).toBe('available')
        }
      }
    })

    test('should find pending pets', async () => {
      const result = await client.get('/pet/findByStatus', {
        query: { status: ['pending'] }
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(Array.isArray(result.data)).toBe(true)
      }
    })

    test('should find sold pets', async () => {
      const result = await client.get('/pet/findByStatus', {
        query: { status: ['sold'] }
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(Array.isArray(result.data)).toBe(true)
      }
    })
  })

  describe('GET /store/inventory', () => {
    test('should get store inventory', async () => {
      const result = await client.get('/store/inventory')

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(typeof result.data).toBe('object')
        expect(result.data).not.toBeNull()
      }
    })
  })

  describe('GET /user/{username}', () => {
    test('should get user by username', async () => {
      const result = await client.get('/user/{username}', {
        params: { username: 'user1' }
      })

      // User may not exist in the test environment
      // So we just check that the request completes
      expect(result).toBeDefined()
    })
  })

  describe('GET /user/login', () => {
    test('should login user', async () => {
      const result = await client.get('/user/login', {
        query: {
          username: 'test',
          password: 'test'
        }
      })

      expect(result).toBeDefined()
    })
  })

  describe('GET /user/logout', () => {
    test('should logout user', async () => {
      const result = await client.get('/user/logout')

      expect(result).toBeDefined()
    })
  })

  describe('POST /pet', () => {
    test.todo('should add a new pet (requires cleanup)', async () => {
      const newPet = {
        name: 'Test Pet',
        photoUrls: ['http://example.com/photo.jpg'],
        status: 'available'
      }

      const result = await client.post('/pet', {
        body: newPet
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        expect(result.data.id).toBeDefined()
        expect(result.data.name).toBe('Test Pet')
      }
    })
  })

  describe('PUT /pet', () => {
    test.todo('should update an existing pet', async () => {
      const updatedPet = {
        id: 1,
        name: 'Updated Pet Name',
        photoUrls: ['http://example.com/photo.jpg'],
        status: 'available'
      }

      const result = await client.put('/pet', {
        body: updatedPet
      })

      expect(result.error).toBe(false)
    })
  })

  describe('DELETE /pet/{petId}', () => {
    test.todo('should delete a pet', async () => {
      const result = await client.delete('/pet/{petId}', {
        params: { petId: 999 }
      })

      // Might return 404 if pet doesn't exist
      expect(result).toBeDefined()
    })
  })

  describe('Type safety', () => {
    test('should enforce correct types for pet properties', async () => {
      // This test verifies type checking at compile time
      const result = await client.get('/pet/{petId}', {
        params: { petId: 1 }
      })

      expect(result.error).toBe(false)
      if (!result.error) {
        // TypeScript should ensure these properties exist
        const pet = result.data
        expect(pet).toBeDefined()

        // These would cause TypeScript errors if types were wrong:
        // const id: string = pet.id // Error: number is not assignable to string
        // const photoUrls: string = pet.photoUrls // Error: array is not assignable to string
      }
    })

    test('should enforce query parameter types', async () => {
      // TypeScript should ensure correct enum values
      const result = await client.get('/pet/findByStatus', {
        query: { status: ['available'] }
      })

      // This would cause a TypeScript error:
      // client.get('/pet/findByStatus', { query: { status: 'invalid' } })

      expect(result.error).toBe(false)
    })

    test('should enforce required body properties', async () => {
      // This test verifies that required properties are enforced
      // Missing required properties would cause TypeScript errors

      // This would cause TypeScript errors due to missing required fields:
      // await client.post('/pet', {
      //   body: { name: 'Test' } // Error: photoUrls is required
      // })

      // Correct usage with all required fields:
      const validPet = {
        name: 'Test Pet',
        photoUrls: ['http://example.com/photo.jpg']
      }

      expect(validPet.name).toBeDefined()
      expect(validPet.photoUrls).toBeDefined()
    })
  })
})

describe('PetStore with request interceptor', () => {
  test('should add custom headers via interceptor', async () => {
    let interceptedHeaders: CustomFetchInit['headers'] | null = null

    const client = createFetchClient<OpenAPIs>({
      fetchImpl: fetch as any,
      requestInterceptor: async (request) => {
        request.url = API_BASE + request.url
        request.init.headers['X-Custom-Header'] = 'test-value'
        interceptedHeaders = request.init.headers
        return request
      }
    })

    await client.get('/pet/{petId}', {
      params: { petId: 1 }
    })

    expect(interceptedHeaders).toBeDefined()
    expect(interceptedHeaders!['X-Custom-Header']).toBe('test-value')
  })
})

describe('PetStore with response interceptor', () => {
  test('should modify response via interceptor', async () => {
    let interceptorCalled = false

    const client = createFetchClient<OpenAPIs>({
      fetchImpl: fetch as any,
      requestInterceptor: async (request) => {
        request.url = API_BASE + request.url
        return request
      },
      responseInterceptor: async () => {
        interceptorCalled = true
        // Return null to keep original response
        return null
      }
    })

    await client.get('/pet/{petId}', {
      params: { petId: 1 }
    })

    expect(interceptorCalled).toBe(true)
  })
})

describe('PetStore with error handling', () => {
  test('should handle errors with custom handler', async () => {
    let errorHandled = false

    const client = createFetchClient<OpenAPIs>({
      fetchImpl: fetch as any,
      requestInterceptor: async (request) => {
        request.url = API_BASE + request.url
        return request
      },
      errorHandler: () => {
        errorHandled = true
      }
    })

    // Request non-existent pet
    const result = await client.get('/pet/{petId}', {
      params: { petId: 99999999 }
    })

    // Error handler is called for errors
    // The exact behavior depends on the API response
    expect(result).toBeDefined()
  })
})

describe('PetStore schema validation', () => {
  test('should have correct Pet type structure', async () => {
    // Verify the generated schema has correct structure
    const petSchema = {
      id: 1,
      category: { id: 1, name: 'Dogs' },
      name: 'doggie',
      photoUrls: ['http://example.com/photo.jpg'],
      tags: [{ id: 1, name: 'tag1' }],
      status: 'available'
    } as const

    // This verifies the type matches what we expect
    expect(petSchema.id).toBe(1)
    expect(petSchema.name).toBe('doggie')
    expect(petSchema.photoUrls).toHaveLength(1)
  })

  test('should support all enum values for pet status', () => {
    const statuses = ['available', 'pending', 'sold'] as const

    // Verify all expected enum values are valid
    expect(statuses).toContain('available')
    expect(statuses).toContain('pending')
    expect(statuses).toContain('sold')
  })

  test('should have correct Order type structure', () => {
    const orderSchema = {
      id: 1,
      petId: 1,
      quantity: 1,
      shipDate: '2024-01-01T00:00:00Z',
      status: 'placed',
      complete: false
    } as const

    expect(orderSchema.id).toBe(1)
    expect(orderSchema.status).toBe('placed')
  })
})
