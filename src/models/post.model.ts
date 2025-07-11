import { BaseModel } from "./base.model";

export interface IPostFile {
  url: string;
  fileType: string;
  key: string;
}
export interface ITags {
  userId: string;
  positionX?: string;
  positionY?: string;
}
export interface IPostFileData extends IPostFile {
  url: string;
  fileType: string;
  key: string;
  tags?: ITags[]
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
  files?: IPostFileData[];
  topicSlug?: string;
}
