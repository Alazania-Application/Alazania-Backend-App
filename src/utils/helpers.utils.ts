import jsonWebToken from "jsonwebtoken/index";
/**
 * Generates jwt token
 * @param payload
 * @param key
 * @param {number} expiryTime  -  Time taken for token to expire in minutes
 * @returns {string} token
 */
export const generateJwtToken = (
    payload: string | Buffer | object,
    key: string | Buffer,
    options?: jsonWebToken.SignOptions,
  ): string => {
    return jsonWebToken.sign(payload, key, options);
  };
  
  export const verifyJwtToken = (token: string, key: string): any => {
    return jsonWebToken.verify(token, key) as any;
  };

  export const getFormattedUrl = (url: string) =>
    url.startsWith("http") ? url : `https://${url}`;
  