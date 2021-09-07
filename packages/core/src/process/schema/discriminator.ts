import { CodegenDiscriminatableSchema, CodegenDiscriminator, CodegenDiscriminatorMappings, CodegenDiscriminatorReference, CodegenDiscriminatorSchema, CodegenNamedSchema, CodegenSchema, CodegenSchemaPurpose, CodegenTypeInfo, isCodegenAllOfSchema, isCodegenAnyOfSchema, isCodegenDiscriminatorSchema, isCodegenInterfaceSchema, isCodegenObjectLikeSchema, isCodegenObjectSchema, isCodegenOneOfSchema, isCodegenScope } from '@openapi-generator-plus/types'
import { OpenAPIV3 } from 'openapi-types'
import { toCodegenSchemaUsage } from '.'
import * as idx from '@openapi-generator-plus/indexed-type'
import { InternalCodegenState } from '../../types'
import { OpenAPIX } from '../../types/patches'
import { equalCodegenTypeInfo, extractCodegenTypeInfo, resolveReference, typeInfoToString } from '../utils'
import { toCodegenVendorExtensions } from '../vendor-extensions'
import { findProperty, removeProperty } from './utils'

/**
 * Create a CodegenDiscriminator for the given schema, to be put into the target
 * @param schema the schema containing the discriminator
 * @param target the CodegenDiscriminatorSchema where the discriminator will go 
 * @param state 
 * @returns 
 */
export function toCodegenSchemaDiscriminator(schema: OpenAPIX.SchemaObject, target: CodegenDiscriminatorSchema): CodegenDiscriminator | null {
	if (!schema.discriminator) {
		return null
	}

	let schemaDiscriminator = schema.discriminator as string | OpenAPIV3.DiscriminatorObject
	if (typeof schemaDiscriminator === 'string') {
		/* OpenAPIv2 support */
		const vendorExtensions = toCodegenVendorExtensions(schema)

		schemaDiscriminator = {
			propertyName: schemaDiscriminator,
			/* Note that we support a vendor extension here to allow mappings in OpenAPI v2 specs */
			mapping: vendorExtensions && vendorExtensions['x-discriminator-mapping'],
		}
	}

	let discriminatorType: CodegenTypeInfo | undefined = undefined
	if (isCodegenObjectSchema(target)) {
		const discriminatorProperty = findProperty(target, schemaDiscriminator.propertyName)
		if (!discriminatorProperty) {
			throw new Error(`Discriminator property "${schemaDiscriminator.propertyName}" missing from "${target.name}"`)
		}

		discriminatorType = extractCodegenTypeInfo(discriminatorProperty)
	} else if (isCodegenAnyOfSchema(target) || isCodegenOneOfSchema(target)) {
		/* For an anyOf or oneOf schemas we have to look in their composes to find the property */
		discriminatorType = findCommonDiscriminatorPropertyType(schemaDiscriminator.propertyName, target.composes, target)
	} else if (isCodegenInterfaceSchema(target)) {
		/* First check if the interface has the property, which is the case if it's the root of an allOf */
		const discriminatorProperty = findProperty(target, schemaDiscriminator.propertyName)
		if (discriminatorProperty) {
			discriminatorType = extractCodegenTypeInfo(discriminatorProperty)
		} else {
			/* Or for a oneOf interface, look in its implementors */
			discriminatorType = findCommonDiscriminatorPropertyType(schemaDiscriminator.propertyName, target.implementors || [], target)
		}
	} else {
		throw new Error(`Unsupported schema type for discriminator: ${target.schemaType}`)
	}

	const result: CodegenDiscriminator = {
		name: schemaDiscriminator.propertyName,
		mappings: toCodegenDiscriminatorMappings(schemaDiscriminator),
		references: [],
		...discriminatorType,
	}

	return result
}

/**
 * Make sure we load any models referenced by the discriminator, as they may not be
 * in our components/schemas that we load automatically, such as when they're in external
 * documents.
 * 
 * NOTE: this is separated from toCodegenSchemaDiscriminator as we must not load additional schemas
 *       until the model has its discriminator set, otherwise we will not be able to find and add
 *       new schemas to the discriminator.
 */
export function loadDiscriminatorMappings(schema: CodegenDiscriminatorSchema, state: InternalCodegenState): void {
	if (!schema.discriminator || !schema.discriminator.mappings) {
		return
	}

	for (const mappingRef of Object.keys(schema.discriminator.mappings)) {
		toCodegenSchemaUsage({ $ref: mappingRef }, state, {
			required: false,
			suggestedName: `${schema.name}`,
			purpose: CodegenSchemaPurpose.MODEL,
			scope: isCodegenScope(schema) ? schema : null,
		})
	}
}

function toCodegenDiscriminatorMappings(discriminator: OpenAPIV3.DiscriminatorObject): CodegenDiscriminatorMappings | null {
	if (!discriminator.mapping) {
		return null
	}

	const schemaMappings: CodegenDiscriminatorMappings = {}
	for (const mapping in discriminator.mapping) {
		const ref = discriminator.mapping[mapping]
		schemaMappings[ref] = mapping
	}
	return schemaMappings
}

/**
 * Find the common discriminator property type for a named discimrinator property across a collection of schemas.
 * @param propertyName the name of the property
 * @param schemas the schemas to look for the property in
 * @param container the container of the discriminator property
 * @returns 
 */
function findCommonDiscriminatorPropertyType(propertyName: string, schemas: CodegenSchema[], container: CodegenNamedSchema): CodegenTypeInfo {
	let result: CodegenTypeInfo | undefined = undefined
	for (const schema of schemas) {
		if (isCodegenObjectSchema(schema)) {
			if (schema.properties) {
				const property = idx.get(schema.properties, propertyName)
				if (property) {
					const propertyType = extractCodegenTypeInfo(property)
					if (result === undefined) {
						result = propertyType
					} else if (!equalCodegenTypeInfo(result, propertyType)) {
						throw new Error(`Found mismatching type for discriminator property "${propertyName}" for "${container.name}" in "${schema.name}": ${typeInfoToString(propertyType)} vs ${typeInfoToString(result)}`)
					}
				} else {
					throw new Error(`Discriminator property "${propertyName}" for "${container.name}" missing in "${schema.name}"`)
				}
			}
		} else {
			throw new Error(`Found unexpected schema type (${schema.schemaType}) when looking for discriminator property "${propertyName}" for "${container.name}"`)
		}
	}
	if (!result) {
		throw new Error(`Discriminator property "${propertyName}" missing from all schemas for "${container.name}"`)
	}
	return result
}

/**
 * Find the appropriate discriminator value to use for the given model
 * @param discriminator the discriminator
 * @param model the model to find the value for
 * @returns 
 */
export function findDiscriminatorValue(discriminator: CodegenDiscriminator, model: CodegenDiscriminatableSchema, state: InternalCodegenState): string {
	const name = model.serializedName || model.name
	if (!discriminator.mappings) {
		return name
	}
	
	for (const [$ref, value] of idx.iterable(discriminator.mappings)) {
		const resolvedSchema = resolveReference({
			$ref,
		}, state)
		const found = state.knownSchemas.get(resolvedSchema)
		if (found === model) {
			return value
		}
	}

	return name
}

/**
 * Add a new member to the discriminator in the discriminatorSchema.
 * @param discriminatorSchema 
 * @param memberSchema 
 * @param state 
 * @returns 
 */
export function addToDiscriminator(discriminatorSchema: CodegenDiscriminatorSchema, memberSchema: CodegenDiscriminatableSchema, state: InternalCodegenState): void {
	if (!discriminatorSchema.discriminator) {
		return
	}

	/* Check if we've already added this memberSchema */
	if (discriminatorSchema.discriminator.references.find(r => r.model === memberSchema)) {
		return
	}

	if (isCodegenObjectLikeSchema(memberSchema)) {
		const subModelDiscriminatorProperty = findProperty(memberSchema, discriminatorSchema.discriminator.name)
		if (!subModelDiscriminatorProperty) {
			throw new Error(`Discriminator property "${discriminatorSchema.discriminator.name}" for "${discriminatorSchema.name}" missing from "${memberSchema.name}"`)
		}
	}
	
	const discriminatorValue = findDiscriminatorValue(discriminatorSchema.discriminator, memberSchema, state)
	const discriminatorValueLiteral = state.generator.toLiteral(discriminatorValue, {
		...discriminatorSchema.discriminator,
		required: true,
		nullable: false,
		readOnly: false,
		writeOnly: false,
	})
	discriminatorSchema.discriminator.references.push({
		model: memberSchema,
		name: discriminatorValue,
		value: discriminatorValueLiteral,
	})
	if (!memberSchema.discriminatorValues) {
		memberSchema.discriminatorValues = []
	}
	memberSchema.discriminatorValues.push({
		model: discriminatorSchema,
		value: discriminatorValueLiteral,
	})
}

/**
 * Find any discriminators in the parent, and add the target to those discriminators
 * @param parent 
 * @param target 
 * @param state 
 */
export function addToAnyDiscriminators(parent: CodegenSchema, target: CodegenDiscriminatableSchema, state: InternalCodegenState): void {
	const discriminatorSchemas = findDiscriminatorSchemas(parent)
	for (const aDiscriminatorSchema of discriminatorSchemas) {
		addToDiscriminator(aDiscriminatorSchema, target, state)
	}
}

/**
 * Find any schemas with discriminators in the given schema and its parents
 * @param schema 
 * @returns 
 */
function findDiscriminatorSchemas(schema: CodegenSchema): CodegenDiscriminatorSchema[] {
	const open = [schema]
	const result: CodegenDiscriminatorSchema[] = []
	for (const aSchema of open) {
		if (isCodegenDiscriminatorSchema(aSchema) && aSchema.discriminator) {
			result.push(aSchema as CodegenDiscriminatorSchema)
		}
		if (isCodegenObjectSchema(aSchema)) {
			if (aSchema.parents) {
				open.push(...aSchema.parents.filter(s => open.indexOf(s) === -1))
			}
			if (aSchema.implements) {
				open.push(...aSchema.implements.filter(s => open.indexOf(s) === -1))
			}
		} else if (isCodegenInterfaceSchema(aSchema)) {
			if (aSchema.parents) {
				open.push(...aSchema.parents.filter(s => open.indexOf(s) === -1))
			}
		} else if (isCodegenAllOfSchema(aSchema)) {
			open.push(...aSchema.composes.filter(s => open.indexOf(s) === -1))
		}
	}
	return result
}

/**
 * Post-process schemas to remove discriminator properties from objects. We don't remove the discriminator
 * properties earlier, as we need to keep them while we're reconciling all of the discriminators, and members,
 * as we try to find the discriminator property.
 * @param schema 
 * @returns 
 */
export function postProcessSchemaForDiscriminator(schema: CodegenSchema): void {
	if (!isCodegenDiscriminatorSchema(schema) || !schema.discriminator) {
		return
	}

	const discriminator = schema.discriminator

	/* Sort references so we generate in a consistent order */
	discriminator.references = discriminator.references.sort(compareDiscriminatorReferences)

	if (isCodegenObjectLikeSchema(schema) && schema.properties) {
		removeProperty(schema, discriminator.name)
	}

	for (const reference of discriminator.references) {
		if (isCodegenObjectLikeSchema(reference.model)) {
			removeProperty(reference.model, discriminator.name)
		}
	}
}

function compareDiscriminatorReferences(a: CodegenDiscriminatorReference, b: CodegenDiscriminatorReference): number {
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}