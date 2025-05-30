export type BaseModel = {
  isDeleted?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type Relevance = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type InterestLevels = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// **Range**: 1-10 (where 10 = highly relevant, 1 = loosely related)
