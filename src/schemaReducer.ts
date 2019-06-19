import Ajv from 'ajv'
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLType,
  GraphQLUnionType,
} from 'graphql'
import { JSONSchema7 } from 'json-schema'
import _ from 'lodash'
import uppercamelcase from 'uppercamelcase'

import { graphqlSafeEnumKey } from './graphqlSafeEnumKey'
import { err } from './helpers'
import { GraphQLTypeMap, SchemaData, GetTypeProperties } from './types'

/** Maps basic JSON schema types to basic GraphQL types */
const BASIC_TYPE_MAPPING = {
  string: GraphQLString,
  integer: GraphQLInt,
  number: GraphQLFloat,
  boolean: GraphQLBoolean,
}
export function schemaReducer(knownTypes: GraphQLTypeMap, { schema, getTypeProperties }: SchemaData) {
  // validate against the json schema schema
  new Ajv().validateSchema(schema)

  const typeName = schema.$id
  if (typeof typeName === 'undefined') throw err('Schema does not have an `$id` property.')

  knownTypes[typeName] = buildType(typeName, schema, knownTypes, getTypeProperties)
  return knownTypes
}

function buildType(propName: string, schema: JSONSchema7, knownTypes: GraphQLTypeMap, getTypeProperties?: GetTypeProperties): GraphQLType {
  const name = uppercamelcase(propName)

  // oneOf?
  if (!_.isUndefined(schema.oneOf)) {
    const cases = schema.oneOf as JSONSchema7
    const caseKeys = Object.keys(cases)
    const types: GraphQLObjectType[] = caseKeys.map((caseName: string) => {
      const caseSchema = cases[caseName]
      const qualifiedName = `${name}.oneOf[${caseName}]`
      const typeSchema = (caseSchema.then || caseSchema) as JSONSchema7
      return buildType(qualifiedName, typeSchema, knownTypes, getTypeProperties) as GraphQLObjectType
    })
    const description = buildDescription(schema)
    return new GraphQLUnionType({ name, description, types })
  }

  // object?
  else if (schema.type === 'object') {
    const description = buildDescription(schema)
    const fields = () =>
      !_.isEmpty(schema.properties)
        ? _.mapValues(schema.properties, (prop: JSONSchema7, fieldName: string) => {
          const qualifiedFieldName = `${name}.${fieldName}`
          const type = buildType(qualifiedFieldName, prop, knownTypes, getTypeProperties) as GraphQLObjectType
          const isRequired = _.includes(schema.required, fieldName)
          return {
            type: isRequired ? new GraphQLNonNull(type) : type,
            description: buildDescription(prop),
          }
        })
        : // GraphQL doesn't allow types with no fields, so put a placeholder
        { _empty: { type: GraphQLString } }
    return new GraphQLObjectType({
      name,
      description,
      fields,
      ...(getTypeProperties ? getTypeProperties(name, GraphQLObjectType) : {})
    })
  }

  // array?
  else if (schema.type === 'array') {
    const elementType = buildType(name, schema.items as JSONSchema7, knownTypes, getTypeProperties)
    return new GraphQLList(new GraphQLNonNull(elementType))
  }

  // enum?
  else if (!_.isUndefined(schema.enum)) {
    if (schema.type !== 'string') throw err(`Only string enums are supported.`, name)
    const description = buildDescription(schema)
    const graphqlToJsonMap = _.keyBy(schema.enum, graphqlSafeEnumKey)
    const values = _.mapValues(graphqlToJsonMap, (value: string) => ({ value }))
    return new GraphQLEnumType({
      name,
      description,
      values,
      ...(getTypeProperties ? getTypeProperties(name, GraphQLEnumType) : {})
    })
  }

  // $ref?
  else if (!_.isUndefined(schema.$ref)) {
    const type = knownTypes[schema.$ref as string]
    if (!type) throw err(`The referenced type ${schema.$ref} is unknown.`, name)
    return type
  }

  // basic?
  else if (BASIC_TYPE_MAPPING[schema.type as string]) {
    return BASIC_TYPE_MAPPING[schema.type as string]
  }

  // ¯\_(ツ)_/¯
  else throw err(`The type ${schema.type} on property ${name} is unknown.`)
}

function buildDescription(d: any): string | undefined {
  if (d.title && d.description) return `${d.title}: ${d.description}`
  return d.title || d.description || undefined
}
