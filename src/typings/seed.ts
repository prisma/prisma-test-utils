import { DMMF } from '@prisma/photon/runtime/dmmf-types'
import ml from 'multilines'
import { EOL } from 'os'

import { Scalar, isSupportedScalar, isScalar } from '../static/scalars'
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
  | "*": { amount: number }
  | ${models.map(generateSeedModelType).join(EOL)}
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

    /**
     * Enum fields have to be manually resolved. Because of that,
     *  factory is required on types that have enum fields.
     */
    const hasEnumFields = fields.some(f => f.kind === 'enum')
    const hasSupportedScalars = fields.filter(isScalar).every(isSupportedScalar)

    /* prettier-ignore */
    const generatedSeedModelType = ml`
    | ${model.name}${q(!hasEnumFields && hasSupportedScalars)}: { 
    |   amount?: number, 
    |   factory${q(!hasEnumFields && hasSupportedScalars)}: {
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
        const union = values.map(val => `"${val}"`).join(` | `)
        return `${field.name}: (${union}) | (() => ${union})`
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
        const scalar = getTSTypeFromDMMFScalar(field.type)
        const supported = isSupportedScalar(field)
        return `${field.name}${q(supported)}: ${scalar} | (() => ${scalar})`
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
  ): 'number' | 'string' | 'boolean' | 'any' {
    switch (type) {
      case Scalar.string: {
        return 'string'
      }
      case Scalar.int: {
        return 'number'
      }
      case Scalar.float: {
        return 'number'
      }
      case Scalar.bool: {
        return 'boolean'
      }
      case Scalar.date: {
        return 'string'
      }
      /* istanbul ignore next */
      default: {
        /* Returns any for unsupported/custom scalars. */
        return 'any'
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

  /**
   * Creates an optional TS field modifier.
   * "q" as question mark.
   *
   * @param isOptional
   */
  function q(isOptional: boolean): '?' | '' {
    switch (isOptional) {
      case true: {
        return '?'
      }
      case false: {
        return ''
      }
    }
  }
}
