import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import ml from 'multilines'
import { EOL } from 'os'
import { withDefault, filterMap } from '../static/utils'

/**
 * Generates input types for the `seed` function.
 *
 * @param dmmf
 */
export function generateGeneratedSeedModelsType(dmmf: DMMF.Document): string {
  const models = dmmf.datamodel.models
  const enums = dmmf.datamodel.enums

  const generatedGenerateSeedModelsType = ml`
  | interface GeneratedSeedModels {
  |   "*": { amount: number }
  |   ${models.map(generateSeedModelType).join(EOL)}
  | }
  `

  return generatedGenerateSeedModelsType

  /* Helper functions */
  /**
   * Generates type definitions of a particular model.
   *
   * @param model
   */
  function generateSeedModelType(model: DMMF.Model): string {
    const fields = model.fields
    /* prettier-ignore */
    const generatedSeedModelType = ml`
    | ${model.name}: { 
    |   amount: number, 
    |   factory?: {
    |     ${filterMap(fields, f => generateSeedModelFieldType(model, f)).join(EOL)} 
    |   }
    | }
    `
    return generatedSeedModelType
  }

  /**
   * Generates type definitions of a particular model field.
   *
   * @param field
   */
  function generateSeedModelFieldType(
    model: DMMF.Model,
    field: DMMF.Field,
  ): string | null {
    switch (field.kind) {
      case 'enum': {
        /**
         * The field should generate a function which results in one
         * of the enum values.
         */
        const { values } = enums.find(e => e.name === field.type)!
        return `${field.name}: () => ${values.join(` | `)}`
      }
      case 'object': {
        /**
         * The field should return a min or max number on abmigious
         * fields.
         */
        switch (getRelationType(model, field)) {
          case '1-to-many': {
            return `${field.name}?: { min?: number, max?: number }`
          }
          case 'many-to-many': {
            return `${field.name}?: { min?: number, max?: number }`
          }
          default: {
            return null
          }
        }
      }
      case 'scalar': {
        /**
         * The field should provide a function which results in a type
         * of the scalar.
         */
        return `${field.name}?: () => ${getTSTypeFromDMMFScalar(field.type)}`
      }
    }
  }

  /**
   * Converts a DMMF scalar to TypeScript scalar.
   *
   * @param type
   */
  function getTSTypeFromDMMFScalar(
    type: string,
  ): 'number' | 'string' | 'boolean' {
    switch (type) {
      case 'String': {
        return 'string'
      }
      case 'Int': {
        return 'number'
      }
      case 'Float': {
        return 'number'
      }
      case 'Boolean': {
        return 'boolean'
      }
      /* istanbul ignore next */
      default: {
        throw new Error(`Something very unexpected happened (${type})!`)
      }
    }
  }

  /**
   * Calculates the relation type.
   *
   * @param field
   */
  function getRelationType(
    model: DMMF.Model,
    field: DMMF.Field,
  ): '1-to-1' | '1-to-many' | 'many-to-1' | 'many-to-many' {
    /**
     * Find the back relation.
     */
    const relationModel = models.find(m => m.name === field.type)
    const relationField = withDefault<DMMF.Field>(
      {
        kind: 'object',
        name: '',
        isRequired: false,
        isList: false,
        isId: false,
        type: field.type,
        isGenerated: false,
        isUnique: false,
        dbName: '',
      },
      relationModel.fields.find(f => f.type === model.name),
    )

    /* Relation type definitions */
    if (field.isList && relationField.isList) {
      /**
       * many-to-many (A)
       *
       * model A {
       *  bs: [B]
       * }
       * model B {
       *  as: [A]
       * }
       */

      return 'many-to-many'
    } else if (!field.isList && relationField.isList) {
      /**
       * many-to-1 (A)
       *
       * model A {
       *  b: B
       * }
       * model B {
       *  as: [A]
       * }
       */

      return 'many-to-1'
    } else if (field.isList && !relationField.isList) {
      /**
       * 1-to-many (A)
       *
       * model A {
       *  bs: b[]
       * }
       *
       * model B {
       *  a: A
       * }
       */

      return '1-to-many'
    } else {
      /**
       * 1-to-1 (A)
       *
       * model A {
       *  b: B
       * }
       * model B {
       *  a: A
       * }
       */

      return '1-to-1'
    }
  }
}
