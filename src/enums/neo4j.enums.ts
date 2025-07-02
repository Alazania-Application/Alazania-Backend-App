export enum NodeLabels {
  User = "User",
  Hashtag = "Hashtag",
  Topic = "Topic",
  Post = "Post",
  PostSession = "PostSession",
  TTL = "TTL",
  Comment = "Comment",
  OTP = "OTP",
  File = "File",
}

export enum RelationshipTypes {
  CONTAINS = "CONTAINS_HASHTAG", //Topics -> hashtags
  FOLLOWS_HASHTAG = "FOLLOWS_HASHTAG", //User -> hashtags
  INTERESTED_IN = "INTERESTED_IN", //User -> Topic
  FOLLOWS = "FOLLOWS", //User -> User
  BELONGS_TO = "BELONGS_TO", // Post -> TOPIC
  HAS_HASHTAG = "HAS_HASHTAG", // Post -> HASHTAG
  ENGAGES_WITH = "ENGAGES_WITH", // User -> POST
  
  // POST-RELATIONSHIPS
  POSTED = "POSTED", // User -> POST
  LIKED = "LIKED", //User -> POST
  COMMENTED_ON = "COMMENTED_ON", // User -> POST
  COMMENTED_BY = "COMMENTED_BY", // User -> COMMENT
  REPLIED_TO = "REPLIED_TO", // COMMENT -> COMMENT
  HAS_COMMENT = "HAS_COMMENT", // POST -> COMMENT
  
}
