import { BaseModel } from "./base.model"

export interface Topic extends BaseModel {
    name: string
    description: string
    slug: string
    popularity?: number
  }
  
  export interface CreateTopicInput {
    name: string
    description?: string
  }
  