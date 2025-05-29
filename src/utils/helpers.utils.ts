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
  options?: jsonWebToken.SignOptions
): string => {
  return jsonWebToken.sign(payload, key, options);
};

/**
 * Description placeholder
 *
 * @param {string} token
 * @param {string} key
 * @returns {*}
 */
export const verifyJwtToken = (token: string, key: string): any => {
  return jsonWebToken.verify(token, key) as any;
};

/**
 * Description placeholder
 *
 * @param {string} url
 * @returns {string}
 */
export const getFormattedUrl = (url: string) =>
  url.startsWith("http") ? url : `https://${url}`;

/**
 * Description placeholder
 *
 * @export
 * @template T
 * @template {keyof T} K
 * @param {T} entity
 * @param {K[]} keys
 * @returns {Pick<T, K>}
 */
export function toDTO<T, K extends keyof T>(entity: T, keys: K[]): Pick<T, K> {
  if (entity === null || typeof entity !== "object" || Array.isArray(entity)) {
    throw new Error("toDTO: input must be a plain object");
  }
  const dto: Partial<T> = {};
  keys.forEach((key) => {
    (dto as any)[key] = entity[key];
  });
  return dto as Pick<T, K>;
}

/**
 * Description placeholder
 *
 * @export
 * @template T
 * @template {keyof T} K
 * @param {T} entity
 * @param {K[]} keys
 * @returns {Omit<T, K>}
 */
export function omitDTO<T extends object, K extends keyof T>(
  entity: T,
  keysToOmit: K[]
): Omit<T, K> {
  if (entity === null || typeof entity !== "object" || Array.isArray(entity)) {
    throw new Error("omitDTO: input must be a plain object");
  }
  const dto = {} as Omit<T, K>;

  (Object.keys(entity) as (keyof T)[]).forEach((key) => {
    if (!keysToOmit.includes(key as K)) {
      (dto as any)[key] = entity[key];
    }
  });

  return dto;
}
