export type OpenAPIComponents = {
  schemas: {
    ApiResponse: {
      code?: number,
      type?: string,
      message?: string
    },
    Category: {
      id?: number,
      name?: string
    },
    Pet: {
      id?: number,
      category?: OpenAPIComponents['schemas']['Category'],
      /**
       * @example doggie
       */
      name: string,
      photoUrls: string[],
      tags?: OpenAPIComponents['schemas']['Tag'][],
      /**
       * @description pet status in the store
       * @enum available,pending,sold
       */
      status?: string
    },
    Tag: {
      id?: number,
      name?: string
    },
    Order: {
      id?: number,
      petId?: number,
      quantity?: number,
      shipDate?: string,
      /**
       * @description Order Status
       * @enum placed,approved,delivered
       */
      status?: string,
      complete?: boolean
    },
    User: {
      id?: number,
      username?: string,
      firstName?: string,
      lastName?: string,
      email?: string,
      password?: string,
      phone?: string,
      /**
       * @description User Status
       */
      userStatus?: number
    }
  },
  responses: never,
  // parameters: {},
  // headers: {},
  requestBodies: {
    UserArray:  OpenAPIComponents['schemas']['User'][],
    Pet:  OpenAPIComponents['schemas']['Pet']
  }
}
export type OpenAPIs = {
  post: {
    /**
     * uploads an image
     */
    '/pet/{petId}/uploadImage': {
      query: never,
      params: {
        petId: number
      },
      headers: never,
      body: {
        /**
         * @description Additional data to pass to server
         */
        additionalMetadata?: string,
        /**
         * @description file to upload
         */
        file?: File
      },
      response: OpenAPIComponents['schemas']['ApiResponse']
    },
    /**
     * Add a new pet to the store
     */
    '/pet': {
      query: never,
      params: never,
      headers: never,
      body: OpenAPIComponents['requestBodies']['Pet'],
      response: any
    },
    /**
     * Updates a pet in the store with form data
     */
    '/pet/{petId}': {
      query: never,
      params: {
        petId: number
      },
      headers: never,
      body: {
        /**
         * @description Updated name of the pet
         */
        name?: string,
        /**
         * @description Updated status of the pet
         */
        status?: string
      },
      response: any
    },
    /**
     * Place an order for a pet
     */
    '/store/order': {
      query: never,
      params: never,
      headers: never,
      body: OpenAPIComponents['schemas']['Order'],
      response: OpenAPIComponents['schemas']['Order']
    },
    /**
     * Creates list of users with given input array
     */
    '/user/createWithList': {
      query: never,
      params: never,
      headers: never,
      body: OpenAPIComponents['requestBodies']['UserArray'],
      response: any
    },
    /**
     * Creates list of users with given input array
     */
    '/user/createWithArray': {
      query: never,
      params: never,
      headers: never,
      body: OpenAPIComponents['requestBodies']['UserArray'],
      response: any
    },
    /**
     * Create user
     * @description This can only be done by the logged in user.
     */
    '/user': {
      query: never,
      params: never,
      headers: never,
      body: OpenAPIComponents['schemas']['User'],
      response: any
    }
  },
  put: {
    /**
     * Update an existing pet
     */
    '/pet': {
      query: never,
      params: never,
      headers: never,
      body: OpenAPIComponents['requestBodies']['Pet'],
      response: any
    },
    /**
     * Updated user
     * @description This can only be done by the logged in user.
     */
    '/user/{username}': {
      query: never,
      params: {
        username: string
      },
      headers: never,
      body: OpenAPIComponents['schemas']['User'],
      response: any
    }
  },
  get: {
    /**
     * Finds Pets by status
     * @description Multiple status values can be provided with comma separated strings
     */
    '/pet/findByStatus': {
      query: {
        status: string[]
      },
      params: never,
      headers: never,
      body: never,
      response: OpenAPIComponents['schemas']['Pet'][]
    },
    /**
     * Finds Pets by tags
     * @description Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing.
     */
    '/pet/findByTags': {
      query: {
        tags: string[]
      },
      params: never,
      headers: never,
      body: never,
      response: OpenAPIComponents['schemas']['Pet'][]
    },
    /**
     * Find pet by ID
     * @description Returns a single pet
     */
    '/pet/{petId}': {
      query: never,
      params: {
        petId: number
      },
      headers: never,
      body: never,
      response: OpenAPIComponents['schemas']['Pet']
    },
    /**
     * Returns pet inventories by status
     * @description Returns a map of status codes to quantities
     */
    '/store/inventory': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: {}
    },
    /**
     * Find purchase order by ID
     * @description For valid response try integer IDs with value >= 1 and <= 10. Other values will generated exceptions
     */
    '/store/order/{orderId}': {
      query: never,
      params: {
        orderId: number
      },
      headers: never,
      body: never,
      response: OpenAPIComponents['schemas']['Order']
    },
    /**
     * Get user by user name
     */
    '/user/{username}': {
      query: never,
      params: {
        username: string
      },
      headers: never,
      body: never,
      response: OpenAPIComponents['schemas']['User']
    },
    /**
     * Logs user into the system
     */
    '/user/login': {
      query: {
        username: string,
        password: string
      },
      params: never,
      headers: never,
      body: never,
      response: string
    },
    /**
     * Logs out current logged in user session
     */
    '/user/logout': {
      query: never,
      params: never,
      headers: never,
      body: never,
      response: any
    }
  },
  delete: {
    /**
     * Deletes a pet
     */
    '/pet/{petId}': {
      query: never,
      params: {
        petId: number
      },
      headers: {
        api_key?: string
      },
      body: never,
      response: any
    },
    /**
     * Delete purchase order by ID
     * @description For valid response try integer IDs with positive integer value. Negative or non-integer values will generate API errors
     */
    '/store/order/{orderId}': {
      query: never,
      params: {
        orderId: number
      },
      headers: never,
      body: never,
      response: any
    },
    /**
     * Delete user
     * @description This can only be done by the logged in user.
     */
    '/user/{username}': {
      query: never,
      params: {
        username: string
      },
      headers: never,
      body: never,
      response: any
    }
  }
}