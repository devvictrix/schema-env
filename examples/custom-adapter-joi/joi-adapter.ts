import type { ObjectSchema } from "joi";
import Joi from "joi";
import type {
  ValidationResult,
  ValidatorAdapter,
  StandardizedValidationError,
} from "schema-env"; // Import necessary types from schema-env

/**
 * Implements the ValidatorAdapter interface for Joi schemas.
 * @template TResult The expected object type after validation.
 */
export class JoiValidatorAdapter<TResult> implements ValidatorAdapter<TResult> {
  constructor(private schema: ObjectSchema<TResult>) {}

  validate(data: Record<string, unknown>): ValidationResult<TResult> {
    // Use Joi's validate method
    // Ensure abortEarly is false to get all errors
    // Ensure convert is true to allow Joi's type coercion
    const result = this.schema.validate(data, {
      abortEarly: false,
      allowUnknown: true, // Necessary because schema-env passes the fully merged env
      convert: true,
      stripUnknown: true,
    });

    if (!result.error) {
      // Validation successful
      return {
        success: true,
        // Joi's validated value might have coerced types
        data: result.value as TResult, // Cast is safe here due to Joi's generics/successful validation
      };
    } else {
      // Validation failed, map Joi errors to standardized format
      const standardizedErrors: StandardizedValidationError[] =
        result.error.details.map((detail) => ({
          // Joi's path is an array of strings/numbers
          path: detail.path,
          // Use Joi's error message
          message: detail.message,
        }));

      return {
        success: false,
        error: {
          issues: standardizedErrors,
        },
      };
    }
  }
}
