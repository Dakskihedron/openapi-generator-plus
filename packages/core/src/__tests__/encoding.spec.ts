import { createTestDocument, createTestGenerator } from './common'
import { idx } from '..'
import { CodegenContentEncodingType, CodegenObjectSchema, CodegenSchemaPurpose, CodegenSchemaType } from '@openapi-generator-plus/types'

test('multipart/form-data basic', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-basic.yml')

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(2) /* As we should have made a nested schema as we require metadata */

	const infoProperty = idx.get(schema.properties!, 'info')!
	const fileProperty = idx.get(schema.properties!, 'file')!
	expect(infoProperty).toBeDefined()
	expect(fileProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)
	expect(infoProperty.schema.purpose).toBe(CodegenSchemaPurpose.PROPERTY)
	expect(fileProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)
	expect(fileProperty.schema.purpose).toBe(CodegenSchemaPurpose.METADATA)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.headers).toBeNull()
	expect(infoPropertyEncoding.contentType).toEqual('application/json')
	expect(infoPropertyEncoding.property.name).toEqual('info')
	expect(infoPropertyEncoding.valueProperty).toBeNull()

	const filePropertyEncoding = idx.get(encoding.properties, 'file')!
	expect(filePropertyEncoding).toBeDefined()
	expect(filePropertyEncoding.headers).toBeNull()
	expect(filePropertyEncoding.contentType).toEqual('application/octet-stream')
	expect(filePropertyEncoding.property.name).toEqual('file')
	expect(filePropertyEncoding.valueProperty!.name).toEqual('value')

	const filePropertySchema = fileProperty.schema as CodegenObjectSchema
	const fileValueProperty = idx.get(filePropertySchema.properties!, 'value')
	expect(fileValueProperty).toBeDefined()
	expect(fileValueProperty!.schema.type).toEqual('file')
	expect(fileValueProperty!.schema.format).toEqual('binary')
})

test('multipart/form-data array', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-array.yml')

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(2) /* As we should have made a nested schema as we require metadata */

	const infoProperty = idx.get(schema.properties!, 'info')!
	const filesProperty = idx.get(schema.properties!, 'files')!
	expect(infoProperty).toBeDefined()
	expect(filesProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)
	expect(infoProperty.schema.purpose).toBe(CodegenSchemaPurpose.PROPERTY)
	expect(filesProperty.schema.schemaType).toEqual(CodegenSchemaType.ARRAY)
	expect(filesProperty.schema.purpose).toBe(CodegenSchemaPurpose.METADATA)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.headers).toBeNull()
	expect(infoPropertyEncoding.contentType).toEqual('application/json')
	expect(infoPropertyEncoding.property.name).toEqual('info')
	expect(infoPropertyEncoding.valueProperty).toBeNull()

	const filePropertyEncoding = idx.get(encoding.properties, 'files')!
	expect(filePropertyEncoding).toBeDefined()
	expect(filePropertyEncoding.headers).toBeNull()
	expect(filePropertyEncoding.contentType).toEqual('application/octet-stream')
	expect(filePropertyEncoding.property.name).toEqual('files')
	expect(filePropertyEncoding.valueProperty!.name).toEqual('value')

	const filePropertySchema = filesProperty.schema.component?.schema as CodegenObjectSchema
	expect(filePropertySchema).toBeTruthy()
	const fileValueProperty = idx.get(filePropertySchema.properties!, 'value')
	expect(fileValueProperty).toBeDefined()
	expect(fileValueProperty!.schema.type).toEqual('file')
	expect(fileValueProperty!.schema.format).toEqual('binary')
})

test('multipart/form-data basic not identifier safe', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-basic-not-identifier-safe.yml')

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(2) /* As we should have made a nested schema as we require metadata */

	const infoProperty = idx.get(schema.properties!, 'Info')!
	const fileProperty = idx.get(schema.properties!, 'File')!
	expect(infoProperty).toBeDefined()
	expect(fileProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)
	expect(fileProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'Info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.contentType).toEqual('text/plain')
	expect(infoPropertyEncoding.property.name).toEqual('info')

	const filePropertyEncoding = idx.get(encoding.properties, 'File')!
	expect(filePropertyEncoding).toBeDefined()
	expect(filePropertyEncoding.property.name).toEqual('file')
})

/** None of the properties require extra metadata */
test('multipart/form-data no metadata', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-no-metadata.yml')

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(1) /* As we should NOT have made a nested schema as we DON'T require metadata */

	const infoProperty = idx.get(schema.properties!, 'info')!
	expect(infoProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.headers).toBeNull()
	expect(infoPropertyEncoding.contentType).toEqual('application/json')
	expect(infoPropertyEncoding.property.name).toEqual('info')
	expect(infoPropertyEncoding.valueProperty).toBeNull()
})

test('multipart/form-data headers', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-headers.yml')
	const generator = createTestGenerator()

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(2) /* As we should have made a nested schema as we require metadata */

	const infoProperty = idx.get(schema.properties!, 'info')!
	expect(infoProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.headers).not.toBeNull()
	expect(infoPropertyEncoding.contentType).toEqual('application/json')
	expect(infoPropertyEncoding.property.name).toEqual('info')
	expect(infoPropertyEncoding.valueProperty!.name).toEqual('value')

	const headerEncoding = idx.get(infoPropertyEncoding.headers!, 'Content-Disposition')!
	expect(headerEncoding).toBeDefined()

	expect(infoPropertyEncoding.headerProperties).not.toBeNull()
	const headerProperty = idx.get(infoPropertyEncoding.headerProperties!, 'Content-Disposition')
	expect(headerProperty).toBeDefined()
	expect(headerProperty!.name).toEqual(generator.toIdentifier('Content-Disposition'))
})

test('multipart/form-data conflicts', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-conflicts.yml')
	const generator = createTestGenerator()

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(2) /* As we should have made a nested schema as we require metadata */

	const infoProperty = idx.get(schema.properties!, 'info')!
	const fileProperty = idx.get(schema.properties!, 'file')!
	expect(infoProperty).toBeDefined()
	expect(fileProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)
	expect(fileProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.headers).not.toBeNull()
	expect(infoPropertyEncoding.contentType).toEqual('application/json')
	expect(infoPropertyEncoding.property.name).toEqual('info')
	expect(infoPropertyEncoding.valueProperty!.name).toEqual('value')

	const filePropertyEncoding = idx.get(encoding.properties, 'file')!
	expect(filePropertyEncoding).toBeDefined()
	expect(filePropertyEncoding.headers).not.toBeNull()
	expect(filePropertyEncoding.contentType).toEqual('application/octet-stream')
	expect(filePropertyEncoding.property.name).toEqual('file')
	expect(filePropertyEncoding.valueProperty!.name).toEqual('value')

	expect(infoPropertyEncoding.headerProperties).not.toBeNull()
	expect(idx.size(infoPropertyEncoding.headerProperties!)).toBe(1)
	const infoHeaderProperty = idx.get(infoPropertyEncoding.headerProperties!, 'value')
	expect(infoHeaderProperty).toBeDefined()
	expect(infoHeaderProperty!.name).toEqual(generator.toIdentifier('value_header'))

	expect(filePropertyEncoding.headerProperties).not.toBeNull()
	expect(idx.size(filePropertyEncoding.headerProperties!)).toBe(1)
	const fileHeaderProperty = idx.get(filePropertyEncoding.headerProperties!, 'value')
	expect(fileHeaderProperty).toBeDefined()
	expect(fileHeaderProperty!.name).toEqual(generator.toIdentifier('value_header'))
})

test('multipart/form-data conflicts in identifiers', async() => {
	const result = await createTestDocument('encoding/multipart-form-data-conflicts-identifiers.yml')
	const generator = createTestGenerator()

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.requestBody).not.toBeNull()

	const schema = op.requestBody?.schema as CodegenObjectSchema
	expect(schema).toBeDefined()
	expect(schema.scopedName.length).toBe(2) /* As we should have made a nested schema as we require metadata */

	const infoProperty = idx.get(schema.properties!, 'info')!
	expect(infoProperty).toBeDefined()

	expect(infoProperty.schema.schemaType).toEqual(CodegenSchemaType.OBJECT)

	const encoding = op.requestBody!.defaultContent.encoding!
	expect(encoding).not.toBeNull()

	expect(encoding.type).toEqual(CodegenContentEncodingType.MULTIPART)

	const infoPropertyEncoding = idx.get(encoding.properties, 'info')!
	expect(infoPropertyEncoding).toBeDefined()
	expect(infoPropertyEncoding.headers).not.toBeNull()
	expect(infoPropertyEncoding.contentType).toEqual('application/json')
	expect(infoPropertyEncoding.property.name).toEqual('info')
	expect(infoPropertyEncoding.valueProperty!.name).toEqual('value')

	expect(infoPropertyEncoding.headerProperties).not.toBeNull()
	expect(idx.size(infoPropertyEncoding.headerProperties!)).toBe(2)

	const infoHeaderProperty1 = idx.get(infoPropertyEncoding.headerProperties!, 'value')
	expect(infoHeaderProperty1).toBeDefined()
	expect(infoHeaderProperty1!.name).toEqual(generator.toIdentifier('value_header'))

	const infoHeaderProperty2 = idx.get(infoPropertyEncoding.headerProperties!, 'Value')
	expect(infoHeaderProperty2).toBeDefined()
	expect(infoHeaderProperty2!.name).toEqual(generator.toIteratedSchemaName(generator.toIdentifier('value_header'), undefined, 1))
})
