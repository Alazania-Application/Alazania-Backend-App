import { BaseModel } from "./base.model";

export interface Hashtag extends BaseModel {
  slug: string;
  name: string;
  popularity?: number;
}

export interface CreateHashtagInput {
  name: string;
}
