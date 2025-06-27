import { BaseModel } from "./base.model";

export interface Post extends BaseModel {
  id: string;
  content: string;
  createdAt: Date;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
}

export interface CreatePostInput {
  postId: string;
  userId: string;
  content: string;
  topicId?: string;
  images?: string[]
}
