import { body } from "express-validator";
import ValidatorMiddleware from "./validator.middleware";

class AuthValidator extends ValidatorMiddleware {
  validateSignUp = this.inputs([
    body("email", "Please provide a valid email").notEmpty().isEmail(),
    body("password", "Password is required")
      .notEmpty()
      .isLength({ min: 8, max: 50 })
      .withMessage("Password must be between 8 and 50 characters long.")
      .matches(/^(?=.*[a-zA-Z])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
      .withMessage(
        "Password must contain at least one alphabet character and one special character (@$!%*?&)."
      ),
  ]);

  validateUsername = this.inputs([
    body("username", "Email/Username/Phone is required").notEmpty().isString(),
  ]);

  validateLogin = this.inputs([
    body("username", "Email/Username/Phone is required").notEmpty().isString(),
    body("password", "Password is required").notEmpty().isString(),
  ]);

  validateReset = this.inputs([
    body("username", "Email/Username/Phone is required").notEmpty().isString(),
    body("password", "Password is required")
      .notEmpty()
      .isLength({ min: 8, max: 50 })
      .withMessage("Password must be between 8 and 50 characters long.")
      .matches(/^(?=.*[a-zA-Z])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
      .withMessage(
        "Password must contain at least one alphabet character and one special character (@$!%*?&)."
      ),
    body("otp", "OTP is required")
      .notEmpty()
      .isLength({ min: 6, max: 6 })
      .withMessage("Invalid OTP"),
  ]);

  validateVerifyUser = this.inputs([
    body("username", "Email/Username/Phone is required").notEmpty().isString(),
    body("otp", "OTP is required")
      .notEmpty()
      .isLength({ min: 6, max: 6 })
      .withMessage("Invalid OTP"),
  ]);

  validateToken = this.inputs([body("token", "token is required").notEmpty()]);
}

export const authValidator = new AuthValidator();
