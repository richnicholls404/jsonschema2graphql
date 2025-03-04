import { GraphQLSchema } from 'graphql'
import { applySchemaCustomDirectives } from 'graphql-custom-directive';
import { JSONSchema7 } from 'json-schema'

import { DEFAULT_ENTRY_POINTS } from './helpers'
import { schemaReducer } from './schemaReducer'
import { ConvertParams, GraphQLTypeMap, SchemaData } from './types'

/**
 * @param jsonSchema - An individual schema or an array of schemas, provided
 * either as Javascript objects or as JSON text.
 *
 * @param entryPoints - By default, each type gets a query field that returns
 * an array of that type. So for example, if you have an `Person` type and a
 * `Post` type, you'll get a query that looks like this:
 *
 * ```graphql
 *    type Query {
 *      people: [Person]
 *      posts: [Posts]
 *    }
 * ```
 *
 * (Note that the name of the query field is [pluralized](https://github.com/blakeembrey/pluralize).)
 *
 * To override this behavior, provide a `queryBlockBuilder` callback that takes
 * a Map of types and returns Query, Mutation (optional), and Subscription (optional)
 * blocks. Each block consists of a hash of `GraphQLFieldConfig`s.
 */
export default function convert({ jsonSchema, entryPoints = DEFAULT_ENTRY_POINTS, getTypeProperties }: ConvertParams): GraphQLSchema {
  // coerce input to array of schema objects
  const schemaArray: SchemaData[] = toArray(jsonSchema).map(schemaItem => ({
    schema: toSchema(schemaItem),
    getTypeProperties
  }))

  const types: GraphQLTypeMap = schemaArray.reduce(schemaReducer, {})

  const schema = new GraphQLSchema({
    ...types,
    ...entryPoints(types),
  })

  return applySchemaCustomDirectives(schema);
}

function toArray(x: JSONSchema7 | JSONSchema7[] | string | string[]): any[] {
  return x instanceof Array
    ? x // already array
    : [x] // single item -> array
}

function toSchema(x: JSONSchema7 | string): JSONSchema7 {
  return x instanceof Object
    ? x // already object
    : JSON.parse(x) // string -> object
}
