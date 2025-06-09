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
}
