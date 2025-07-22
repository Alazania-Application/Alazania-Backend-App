import { query, ValidationChain, validationResult } from "express-validator";
import { NextFunction, Request, Response } from "express";
import { ErrorResponse } from "../../utils";
import { HttpStatusCode } from "axios";

export default class ValidatorMiddleware {
  /**
   * Runs the express-validator validations
   * @param validations - an array containing the express-validator validations
   */
  protected inputs(validations: Array<ValidationChain>) {
    return async (req: Request, res: Response, next: NextFunction) => {
      await Promise.all(validations.map((validation) => validation.run(req)));

      const errors = validationResult(req);

      if (errors.isEmpty()) {
        return next();
      }

      // throw new ErrorResponse(error?.msg, HttpStatusCode.UnprocessableEntity);

      res.status(422).json({
        success: false,
        message: errors?.array()[0].msg,
        errors: errors.array()[0],
        // .map((error: ValidationError & { path: string }) => ({
        //   msg: error?.msg,
        //   path: error?.path,
        // })),
      });
    };
  }

  static async dynamicFieldValidator(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    Object.keys(req.body).forEach((key) => {
      if (
        !req.body[key] ||
        req.body[key] === null ||
        !Boolean(String(req.body[key]).trim())
      ) {
        throw new ErrorResponse(
          `${key} cannot be empty or null`,
          HttpStatusCode.BadRequest
        );
      }
    });

    next();
  }

  static paginationFilters() {
    return async (req: Request, res: Response, next: NextFunction) => {
      await Promise.all(
        [
          query("sort")
            .optional()
            .isIn(["ASC", "DESC"])
            .withMessage("Sort must be either ASC or DESC"),
          query("page")
            .optional()
            .isInt({ min: 1 })
            .withMessage("Page must be a positive integer"),
          query("limit")
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage(
              "Limit must be a positive integer no greater than 100"
            ),
        ].map((validation) => validation.run(req))
      );

      const errors = validationResult(req);

      if (errors.isEmpty()) {
        return next();
      }

      res.status(422).json({
        success: false,
        message: errors?.array()[0].msg,
        errors: errors.array()[0],
      });
    };
  }
}
