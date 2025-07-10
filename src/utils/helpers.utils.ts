import { Request } from "express";
import jsonWebToken from "jsonwebtoken/index";
import {
  Integer,
  isDate,
  isDateTime,
  isDuration,
  isInt,
  isLocalDateTime,
  isLocalTime,
  isTime,
  int,
} from "neo4j-driver";
import slugify from "slugify";
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
  return toNativeTypes(dto) as Pick<T, K>;
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
): Omit<T, K> | null {
  try {
    if (
      entity === null ||
      typeof entity !== "object" ||
      Array.isArray(entity)
    ) {
      throw new Error("omitDTO: input must be a plain object");
    }
    const dto = {} as Omit<T, K>;

    (Object.keys(entity) as (keyof T)[]).forEach((key) => {
      if (!keysToOmit.includes(key as K)) {
        (dto as any)[key] = entity[key];
      }
    });

    return toNativeTypes(dto) as Omit<T, K>;
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * Convert Neo4j Properties back into JavaScript types
 *
 * @param {Record<string, any>} properties
 * @return {Record<string, any>}
 */
export function toNativeTypes(properties: Record<string, any>) {
  return Object.fromEntries(
    Object.keys(properties).map((key) => {
      let value = valueToNativeType(properties[key]);

      return [key, value];
    })
  );
}

/**
 * Convert an individual value to its JavaScript equivalent
 *
 * @param {any} value
 * @returns {any}
 */
export function valueToNativeType(value: any) {
  if (Array.isArray(value)) {
    value = value.map((innerValue) => valueToNativeType(innerValue));
  } else if (isInt(value)) {
    value = value.toNumber();
  } else if (
    isDate(value) ||
    isDateTime(value) ||
    isTime(value) ||
    isLocalDateTime(value) ||
    isLocalTime(value) ||
    isDuration(value)
  ) {
    value = value.toString();
  } else if (
    typeof value === "object" &&
    value !== undefined &&
    value !== null
  ) {
    value = toNativeTypes(value);
  }

  return value;
}

export interface IReadQueryParams {
  sort?: "ASC" | "DESC";
  page?: number | Integer;
  limit?: number | Integer;
  skip?: number | Integer;
}
export interface IPagination {
  page: number;
  limit: number;
  total: number;
}

export const getPaginationFilters = ({
  sort = "DESC",
  page = 1,
  limit = 25,
  ...otherQueries
}: IReadQueryParams): IReadQueryParams & Record<string, any> => {
  const max_limit = 100;

  const sanitizedSort: "ASC" | "DESC" =
    String(sort).toUpperCase().trim() === "ASC" ? "ASC" : "DESC";

  const sanitizedPage =
    typeof Number(page || 1) == "number" ? Number(page || 1) : 1;

  const sanitizedLimit =
    typeof Number(limit || 25) == "number" ? Number(limit || 25) : 25;

  const skip = Number(
    (sanitizedPage - 1) * Math.min(sanitizedLimit, max_limit)
  );

  // const formattedOtherQueries
  const searchQuery = (otherQueries as any)?.search ?? "";
  const search =
    !searchQuery || searchQuery.trim() === ""
      ? null
      : searchQuery.toLowerCase();

  return {
    page: int(sanitizedPage),
    limit: int(Math.min(sanitizedLimit, max_limit)),
    sort: sanitizedSort,
    skip: int(skip),
    ...otherQueries,
    search,
  };
};

export const isIdToken = (token: string) => {
  // A simple heuristic: ID tokens are JWTs and typically have three segments separated by dots
  return token.split(".").length === 3;
};

export const extractHashtags = (text: string) => {
  return [
    ...new Set(
      (text.match(/#\w+/g) || []).map((tag) =>
        slugify(tag, {
          trim: true,
          lower: true,
          remove: /#/g
        })
      )
    ),
  ];
};
