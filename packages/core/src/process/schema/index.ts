import { CodegenSchema, CodegenSchemaPurpose, CodegenSchemaType, CodegenSchemaUsage, CodegenScope } from '@openapi-generator-plus/types'
import { OpenAPIV2, OpenAPIV3 } from 'openapi-types'
import { isOpenAPIReferenceObject, isOpenAPIV2Document } from '../../openapi-type-guards'
import { InternalCodegenState } from '../../types'
import { OpenAPIX } from '../../types/patches'
import { toCodegenExamples } from '../examples'
import { toCodegenExternalDocs } from '../external-docs'
import { extractCodegenSchemaInfo, resolveReference, toDefaultValue } from '../utils'
import { toCodegenVendorExtensions } from '../vendor-extensions'
import { toCodegenAllOfSchema } from './all-of'
import { toCodegenAnyOfSchema } from './any-of'
import { toCodegenArraySchema } from './array'
import { toCodegenBooleanSchema } from './boolean'
import { toCodegenEnumSchema } from './enum'
import { toCodegenMapSchema } from './map'
import { fullyQualifiedName, toUniqueScopedName, extractNaming, usedSchemaName } from './naming'
import { toCodegenNumericSchema } from './numeric'
import { toCodegenObjectSchema } from './object'
import { toCodegenOneOfSchema } from './one-of'
import { toCodegenSchemaType, toCodegenSchemaTypeFromApiSchema } from './schema-type'
import { toCodegenStringSchema } from './string'
import { transformNativeTypeForUsage } from './usage'
import { addToKnownSchemas, addToScope, extractCodegenSchemaCommon } from './utils'

export function discoverCodegenSchemas(specSchemas: OpenAPIV2.DefinitionsObject | Record<string, OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject>, state: InternalCodegenState): void {
	/* Collect defined schema names first, so no inline or external schemas can use those names */
	for (const schemaName in specSchemas) {
		const fqn = fullyQualifiedName([schemaName])
		usedSchemaName([schemaName], state)
		state.reservedSchemaNames[refForSchemaName(schemaName, state)] = fqn
	}

	for (const schemaName in specSchemas) {
		/* We load the schema using a reference as we use references to distinguish between explicit and inline models */
		const reference: OpenAPIX.ReferenceObject = {
			$ref: refForSchemaName(schemaName, state),
		}

		toCodegenSchemaUsage(reference, state, {
			required: true, 
			suggestedName: schemaName,
			purpose: CodegenSchemaPurpose.GENERAL,
			scope: null,
		})
	}
}

/**
 * Returns the value of the `$ref` to use to refer to the given schema definition / component.
 * @param schemaName the name of a schema
 * @param state 
 */
function refForSchemaName(schemaName: string, state: InternalCodegenState): string {
	return isOpenAPIV2Document(state.root) ? `#/definitions/${schemaName}` : `#/components/schemas/${schemaName}`
}

export interface SchemaUsageOptions {
	required: boolean
	suggestedName: string | ((type: CodegenSchemaType) => string)
	nameRequired?: boolean
	purpose: CodegenSchemaPurpose
	scope: CodegenScope | null
}

export function toCodegenSchemaUsage(apiSchema: OpenAPIX.SchemaObject | OpenAPIX.ReferenceObject, state: InternalCodegenState, options: SchemaUsageOptions): CodegenSchemaUsage {
	const $ref = isOpenAPIReferenceObject(apiSchema) ? apiSchema.$ref : undefined
	const originalApiSchema = isOpenAPIReferenceObject(apiSchema) ? apiSchema : undefined
	apiSchema = resolveReference(apiSchema, state)
	fixApiSchema(apiSchema, state)

	const schemaObject = toCodegenSchema(apiSchema, $ref, options, state)
	const result: CodegenSchemaUsage = {
		...extractCodegenSchemaInfo(schemaObject),
		required: options.required,
		schema: schemaObject,
		examples: null,
		defaultValue: null,
	}

	if (originalApiSchema) {
		/* We allow some properties to be overriden on a $ref */
		const originalApiSchemaAsSchemaObject: OpenAPIX.SchemaObject = originalApiSchema
		if (originalApiSchemaAsSchemaObject.nullable) {
			result.nullable = true
		}
		if (originalApiSchemaAsSchemaObject.readOnly) {
			result.readOnly = true
		}
		if (originalApiSchemaAsSchemaObject.writeOnly) {
			result.writeOnly = true
		}
		if (originalApiSchemaAsSchemaObject.deprecated) {
			result.deprecated = true
		}
	}

	/* Apply the schema usage to the native type */
	result.nativeType = transformNativeTypeForUsage(result, state)

	result.examples = apiSchema.example ? toCodegenExamples(apiSchema.example, undefined, undefined, result, state) : null
	result.defaultValue = toDefaultValue(apiSchema.default, result, state)

	return result
}

function toCodegenSchema(apiSchema: OpenAPIX.SchemaObject, $ref: string | undefined, options: SchemaUsageOptions, state: InternalCodegenState): CodegenSchema {
	/* Check if we've already generated this schema, and return it */
	const existing = state.knownSchemas.get(apiSchema)
	if (existing) {
		return existing
	}

	const schemaType = toCodegenSchemaTypeFromApiSchema(apiSchema)

	const { purpose, scope: suggestedScope } = options
	let { suggestedName } = options

	if (typeof suggestedName === 'function') {
		suggestedName = suggestedName(schemaType)
	}
	
	/* Use purpose to refine the suggested name */
	suggestedName = state.generator.toSuggestedSchemaName(suggestedName, {
		purpose,
		schemaType,
	})

	const naming = supportedNamedSchema(schemaType, !!$ref, purpose, state) || options.nameRequired ? toUniqueScopedName($ref, suggestedName, suggestedScope, apiSchema, schemaType, state) : null
	if (naming) {
		usedSchemaName(naming.scopedName, state)
	}

	/* Due to the recursive nature of nameFromRef, we might have actually generated a schema for us now! */
	const existingNow = state.knownSchemas.get(apiSchema)
	if (existingNow) {
		return existingNow
	}
	
	let result: CodegenSchema
	switch (schemaType) {
		case CodegenSchemaType.MAP:
			result = toCodegenMapSchema(apiSchema, naming, naming ? 'value' : suggestedName, naming ? naming.scope : suggestedScope, state)
			break
		case CodegenSchemaType.OBJECT:
			if (!naming) {
				// naming = toUniqueScopedName($ref, suggestedName, suggestedScope, schema, state)
				throw new Error(`no name for ${JSON.stringify(apiSchema)}`)
			}
			result = toCodegenObjectSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.INTERFACE:
			throw new Error(`Cannot create an interface directly from an OpenAPI schema: ${JSON.stringify(apiSchema)}`)
		case CodegenSchemaType.WRAPPER:
			throw new Error(`Cannot create a wrapper directly from an OpenAPI schema: ${JSON.stringify(apiSchema)}`)
		case CodegenSchemaType.HIERARCHY:
			throw new Error(`Cannot create a hierarchy directly from an OpenAPI schema: ${JSON.stringify(apiSchema)}`)
		case CodegenSchemaType.ALLOF:
			if (!naming) {
				throw new Error(`no name for ${JSON.stringify(apiSchema)}`)
			}
			result = toCodegenAllOfSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.ANYOF:
			if (!naming) {
				throw new Error(`no name for ${JSON.stringify(apiSchema)}`)
			}
			result = toCodegenAnyOfSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.ONEOF:
			if (!naming) {
				throw new Error(`no name for ${JSON.stringify(apiSchema)}`)
			}
			result = toCodegenOneOfSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.ARRAY:
			result = toCodegenArraySchema(apiSchema, naming, naming ? 'item' : suggestedName, naming ? naming.scope : suggestedScope, state)
			break
		case CodegenSchemaType.ENUM:
			result = toCodegenEnumSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.NUMBER:
		case CodegenSchemaType.INTEGER:
			result = toCodegenNumericSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.STRING:
			result = toCodegenStringSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.BOOLEAN:
			result = toCodegenBooleanSchema(apiSchema, naming, state)
			break
		case CodegenSchemaType.DATE:
		case CodegenSchemaType.DATETIME:
		case CodegenSchemaType.TIME:
		case CodegenSchemaType.BINARY: {
			if (typeof apiSchema.type !== 'string') {
				throw new Error(`Unsupported schema type "${apiSchema.type}" for property in ${JSON.stringify(apiSchema)}`)
			}

			/* Generic unsupported schema support */
			const type = apiSchema.type
			const format: string | undefined = apiSchema.format
			const vendorExtensions = toCodegenVendorExtensions(apiSchema)

			const nativeType = state.generator.toNativeType({
				type,
				format,
				schemaType,
				vendorExtensions,
			})

			result = {
				...extractNaming(naming),
				type,
				format: format || null,
				schemaType: toCodegenSchemaType(type, format),
				nativeType,
				component: null,

				vendorExtensions,
				externalDocs: toCodegenExternalDocs(apiSchema),

				...extractCodegenSchemaCommon(apiSchema, state),
			}
			break
		}
	}

	result = addToKnownSchemas(apiSchema, result, state)

	if (naming) {
		addToScope(result, naming.scope, state)
	}
	return result
}

// TODO this will be customised by the generator
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function supportedNamedSchema(schemaType: CodegenSchemaType, referenced: boolean, purpose: CodegenSchemaPurpose, state: InternalCodegenState): boolean {
	if (
		schemaType === CodegenSchemaType.OBJECT ||
		schemaType === CodegenSchemaType.ENUM ||
		schemaType === CodegenSchemaType.ALLOF ||
		schemaType === CodegenSchemaType.ANYOF ||
		schemaType === CodegenSchemaType.ONEOF
	) {
		return true
	}

	return false
}

/**
 * Sometimes a schema omits the `type`, even though the specification states that it must be a `string`.
 * This method corrects for those cases where we can determine what the schema _should_ be.
 * @param apiSchema 
 */
function fixApiSchema(apiSchema: OpenAPIX.SchemaObject, state: InternalCodegenState): void {
	if (apiSchema.type === undefined) {
		if (apiSchema.required || apiSchema.properties || apiSchema.additionalProperties) {
			apiSchema.type = 'object'
		} else if (apiSchema.enum) {
			apiSchema.type = 'string'
		}
	}

	/* Some specs have the enum declared at the array level, rather than the items. The Vimeo API schema is an example.
	   https://raw.githubusercontent.com/vimeo/openapi/master/api.yaml
	*/
	if (apiSchema.type === 'array' && apiSchema.enum) {
		if (apiSchema.items) {
			const items = resolveReference(apiSchema.items, state)
			if (!items.enum) {
				items.enum = apiSchema.enum
				apiSchema.enum = undefined
			}
		}
	}
}
