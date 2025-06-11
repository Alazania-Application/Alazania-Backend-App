export enum NodeLabels {
  User = "User",
  Hashtag = "Hashtag",
  Topic = "Topic",
  Post = "Post",
  Comment = "Comment",
  OTP = "OTP",
}

export enum RelationshipTypes {
  CONTAINS = "CONTAINS_HASHTAG", //Topics -> hashtags
  FOLLOWS_HASHTAG = "FOLLOWS_HASHTAG", //User -> hashtags
  INTERESTED_IN = "INTERESTED_IN", //User -> Topic
  FOLLOWS = "FOLLOWS", //User -> User
  LIKED = "LIKED", //User -> POST
  COMMENTED_ON = "COMMENTED_ON", // User -> POST
  POSTED = "POSTED", // User -> POST
  BELONGS_TO = "BELONGS_TO", // Post -> TOPIC
  HAS_HASHTAG = "HAS_HASHTAG", // Post -> HASHTAG
}
