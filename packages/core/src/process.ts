import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types'
import { CodegenDocument, CodegenOperation, CodegenOperationGroup, CodegenOperationGroups, HttpMethods, CodegenGeneratorType, CodegenSchema, CodegenSchemas, isCodegenScope } from '@openapi-generator-plus/types'
import { isOpenAPIV2Document, isOpenAPIV3PathItemObject } from './openapi-type-guards'
import _ from 'lodash'
import { InternalCodegenState } from './types'
import * as idx from '@openapi-generator-plus/indexed-type'
import { toCodegenServers } from './process/servers'
import { resolveReference } from './process/utils'
import { toCodegenSecurityRequirements, toCodegenSecuritySchemes } from './process/security'
import { CodegenOperationContext, toCodegenOperation } from './process/operations'
import { toCodegenParameters } from './process/parameters'
import { discoverCodegenSchemas } from './process/schema'
import { toCodegenInfo } from './process/info'

function groupOperations(operationInfos: CodegenOperation[], state: InternalCodegenState) {
	const strategy = state.generator.operationGroupingStrategy()

	const groups: CodegenOperationGroups = {}
	for (const operationInfo of operationInfos) {
		strategy(operationInfo, groups, state)
	}

	return _.values(groups)
}

function processCodegenDocument(doc: CodegenDocument, state: InternalCodegenState) {
	/* Process groups */
	for (const group of doc.groups) {
		processCodegenOperationGroup(group, state)
	}

	/* Process models */
	processCodegenSchemas(doc.schemas, state)

	/* Sort groups */
	doc.groups.sort((a, b) => a.name.localeCompare(b.name))

	/* Sort schemas */
	doc.schemas = idx.sortValues(doc.schemas, (a, b) => a.name.localeCompare(b.name))

	if (state.generator.postProcessDocument) {
		state.generator.postProcessDocument(doc)
	}
}

function processCodegenOperationGroup(group: CodegenOperationGroup, state: InternalCodegenState) {
	for (let i = 0; i < group.operations.length; i++) {
		const result = processCodegenOperation(group.operations[i], state)
		if (!result) {
			group.operations.splice(i, 1)
			i--
		}
	}

	/* Sort operations */
	group.operations.sort((a, b) => a.name.localeCompare(b.name))
}

function processCodegenSchemas(models: CodegenSchemas, state: InternalCodegenState) {
	for (const entry of idx.iterable(models)) {
		const result = processCodegenSchema(entry[1], state)
		if (!result) {
			idx.remove(models, entry[0])
		} else if (isCodegenScope(entry[1])) {
			const subModels = entry[1].schemas
			if (subModels) {
				processCodegenSchemas(subModels, state)
			}
		}
	}
}

function processCodegenOperation(op: CodegenOperation, state: InternalCodegenState): boolean {
	if (hasNoGenerationRule(op, state)) {
		return false
	}
	
	return true
}

function processCodegenSchema(schema: CodegenSchema, state: InternalCodegenState): boolean {
	if (hasNoGenerationRule(schema, state)) {
		return false
	}

	if (state.generator.postProcessSchema) {
		const result = state.generator.postProcessSchema(schema)
		if (result === false) {
			return false
		}
	}
	return true
}

function hasNoGenerationRule(ob: CodegenOperation | CodegenSchema, state: InternalCodegenState): boolean {
	const generatorType = state.generator.generatorType()
	if (generatorType === CodegenGeneratorType.SERVER) {
		return (ob.vendorExtensions && ob.vendorExtensions['x-no-server'])
	} else if (generatorType === CodegenGeneratorType.CLIENT) {
		return (ob.vendorExtensions && ob.vendorExtensions['x-no-client'])
	} else {
		return false
	}
}

export function processDocument(state: InternalCodegenState): CodegenDocument {
	const operations: CodegenOperation[] = []

	function createCodegenOperation(path: string, method: string, operation: OpenAPI.Operation | undefined, context: CodegenOperationContext) {
		if (!operation) {
			return
		}
	
		const op = toCodegenOperation(path, method, operation, context, state)
		operations.push(op)
	}

	const root = state.root

	/* Process schemas first so we can check for duplicate names when creating new anonymous models */
	const specSchemas = isOpenAPIV2Document(root) ? root.definitions : root.components?.schemas
	if (specSchemas) {
		discoverCodegenSchemas(specSchemas, state)
	}

	for (const path in root.paths) {
		let pathItem: OpenAPIV2.PathItemObject | OpenAPIV3.PathItemObject = root.paths[path]
		if (!pathItem) {
			continue
		}

		pathItem = resolveReference(pathItem, state)

		const operationContext: CodegenOperationContext = {
			parameters: pathItem.parameters ? toCodegenParameters(pathItem.parameters, undefined, path, state) || undefined : undefined,
			summary: isOpenAPIV3PathItemObject(pathItem, state.specVersion) ? pathItem.summary : undefined,
			description: isOpenAPIV3PathItemObject(pathItem, state.specVersion) ? pathItem.description : undefined,
		}
		
		createCodegenOperation(path, HttpMethods.GET, pathItem.get, operationContext)
		createCodegenOperation(path, HttpMethods.PUT, pathItem.put, operationContext)
		createCodegenOperation(path, HttpMethods.POST, pathItem.post, operationContext)
		createCodegenOperation(path, HttpMethods.DELETE, pathItem.delete, operationContext)
		createCodegenOperation(path, HttpMethods.OPTIONS, pathItem.options, operationContext)
		createCodegenOperation(path, HttpMethods.HEAD, pathItem.head, operationContext)
		createCodegenOperation(path, HttpMethods.PATCH, pathItem.patch, operationContext)
		if (isOpenAPIV3PathItemObject(pathItem, state.specVersion)) {
			createCodegenOperation(path, HttpMethods.TRACE, pathItem.trace, operationContext)
		}
	}

	const groups = groupOperations(operations, state)

	const doc: CodegenDocument = {
		info: toCodegenInfo(root.info),
		groups,
		schemas: state.schemas,
		servers: toCodegenServers(root),
		securitySchemes: toCodegenSecuritySchemes(state),
		securityRequirements: root.security ? toCodegenSecurityRequirements(root.security, state) : null,
	}

	processCodegenDocument(doc, state)
	return doc
}
