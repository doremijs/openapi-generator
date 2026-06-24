import { resolve } from 'node:path'
import type { OpenAPIV3 } from 'openapi-types'
import { fetchOpenAPISchema } from './fetcher'
import { saveTextToFile } from './file'
import { generateSchemas } from './generators'
import { prettier } from './prettier'
import type { GenerateOptions, SupportedGenerators } from './types'

export const configFileName = 'o2t.config.mjs'

export async function generate(options: GenerateOptions, generator: SupportedGenerators): Promise<void> {
  const schema = await fetchOpenAPISchema(options.specUrl, options)
  if (schema) {
    // 保存 schema 到文件
    saveTextToFile(options.tempFilePath, JSON.stringify(schema, null, 2))
    const components = schema.components ?? {}

    /**
     * 将parameters里的请求参数拆分成params和queryList
     * @param parameters openapi.parametes
     * @returns 路径参数集合与query参数集合
     */
    function extractParameters(parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[] = []) {
      const paramList: OpenAPIV3.ParameterObject[] = []
      const queryList: OpenAPIV3.ParameterObject[] = []
      const headerList: OpenAPIV3.ParameterObject[] = []
      for (const parameter of parameters) {
        let _parameter: OpenAPIV3.ParameterObject
        if ('$ref' in parameter) {
          const splited = parameter.$ref.split('/')
          const ref = components.parameters?.[splited[splited.length - 1]]
          _parameter = ref as OpenAPIV3.ParameterObject
        } else {
          _parameter = parameter
        }
        if (_parameter.in === 'path') {
          paramList.push(_parameter)
        } else if (_parameter.in === 'query') {
          queryList.push(_parameter)
        } else if (_parameter.in === 'header') {
          headerList.push(_parameter)
        }
      }
      return { queryList, paramList, headerList }
    }

    // paths里的api按照method分组
    const paths = schema.paths ?? {}
    const apiGroups: Record<
      string,
      Record<
        string,
        OpenAPIV3.OperationObject & { queryList: OpenAPIV3.ParameterObject[]; paramList: OpenAPIV3.ParameterObject[]; headerList: OpenAPIV3.ParameterObject[] }
      >
    > = {}
    for (const [path, pathItem] of Object.entries(paths)) {
      if (pathItem) {
        for (const [method, operation] of Object.entries(pathItem)) {
          const _method = method.toLowerCase()
          apiGroups[_method] = apiGroups[_method] || {}
          // @ts-ignore
          apiGroups[_method][path] = operation
          const { queryList, paramList, headerList } = extractParameters(apiGroups[_method][path].parameters)
          // 检测路径中 {param} / :param 模板但未在 OpenAPI 参数中定义的情况
          // 部分后端接口在 path 中使用了 {id} 或 :id 但未在 parameters 中声明
          const pathTemplateParams = path.match(/\{(\w+)\}|:(\w+)/g) || []
          for (const match of pathTemplateParams) {
            const paramName = match.startsWith('{') ? match.slice(1, -1) : match.slice(1)
            if (!paramList.find(p => p.name === paramName)) {
              paramList.push({
                name: paramName,
                in: 'path',
                required: true,
                schema: { type: 'string' }
              })
            }
          }
          apiGroups[_method][path].queryList = queryList
          apiGroups[_method][path].paramList = paramList
          apiGroups[_method][path].headerList = headerList
        }
      }
    }
    const [output, saveFile] = generateSchemas({ components, apiGroups }, generator)
    // 保存输出到文件
    await saveTextToFile(resolve(options.outputDir, saveFile), prettier(output))
  }
}
