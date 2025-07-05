import { BaseModel } from "./base.model";

export interface IPostFile {
  url: string;
  fileType: string;
  key: string;
}
export interface Post extends BaseModel {
  id: string;
  content: string;
  files: string;
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
  caption: string;
  files?: IPostFile[];
  topicSlug?: string;
}
