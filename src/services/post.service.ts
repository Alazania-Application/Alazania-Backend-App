import { CreatePostInput, IUser, Post } from "@/models";
import BaseService from "./base.service";
import { ActivityTypes, NodeLabels, RelationshipTypes } from "@/enums";
import {
  ErrorResponse,
  extractHashtags,
  extractMentions,
  IPagination,
  IReadQueryParams,
  toDTO,
  toNativeTypes,
  valueToNativeType,
} from "@/utils";
import { deleteFolderByPrefix } from "@/middlewares/upload.middleware";
import { HttpStatusCode } from "axios";
import slugify from "slugify";

class PostService extends BaseService {
  private extractPost = (data: Record<any, any>, userId?: string) => {
    const record = data && data?.toObject();
    const post = toNativeTypes(record?.post);
    const creator = post?.creator;
    const topic = post?.topic ?? "";
    const hashtags = post?.hashtags ?? [];
    const mentions = (post?.mentions ?? [])?.filter((v: any) =>
      Boolean(v?.userId)
    );
    const liked = Boolean(!!post?.liked);
    const files = post?.files;

    if (post) {
      return toNativeTypes({
        id: post?.id,
        caption: post?.caption,
        isMyPost: post?.isMyPost || creator?.id == userId,
        createdAt: post?.createdAt,
        files,
        engagement: {
          likes: post?.likes,
          comments: post?.comments,
          shares: post?.shares,
        },
        creator,
        topic: topic ? topic?.name : "",
        hashtags,
        mentions,
        liked,
      });
    }

    return null;
  };

  async validatePostAndSessionIds(userId: string, sessionId: string) {
    const results = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User})-[:${RelationshipTypes.INITIALIZED_POST_SESSION}]->(session:${NodeLabels.PostSession} {sessionId: $sessionId})
        RETURN session LIMIT 1
        `,
      { sessionId, userId }
    );

    if (!results.records?.length) {
      throw new ErrorResponse(
        "An error occurred, please create a new post",
        HttpStatusCode.BadRequest
      );
    }
  }

  async validateDuplicatePost(userId: string, sessionId: string) {
    const results = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(post:${NodeLabels.Post} {id: $sessionId})
        RETURN post LIMIT 1
        `,
      { sessionId, userId }
    );

    if (results.records?.length) {
      throw new ErrorResponse("Duplicate post", HttpStatusCode.BadRequest);
    }
  }

  async initializePostSession(userId: string): Promise<any> {
    const params = {
      userId,
    };

    // Clean up temp uploads
    const sessionPrefix = `${userId}/temp-uploads/`;
    await deleteFolderByPrefix(sessionPrefix);

    // const sessionResult = await this.readFromDB(
    //   `
    //   MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.INITIALIZED_POST_SESSION}]->(session:${NodeLabels.PostSession} {userId: $userId})
    //   RETURN session.sessionId
    // `,
    //   params
    // ); // Make sure 'params' is passed to your readFromDB function

    // let sessionId = null;

    // // Check if any records were returned
    // if (sessionResult.records.length > 0) {
    //   // Get the first record (assuming you expect at most one session per user for this query)
    //   const record = sessionResult.records[0];

    //   // Extract the sessionId using the column name 'session.sessionId'
    //   // Alternatively, you could use record.get(0) if it's the first and only returned item
    //   sessionId = record.get("session.sessionId");

    //   if (sessionId) {
    //     const sessionPrefix = `${userId}/temp-uploads/`;
    //     await deleteFolderByPrefix(sessionPrefix);
    //   }
    // }

    // initialize the post session

    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        OPTIONAL MATCH (exisitingSession:${NodeLabels.PostSession} {userId: $userId})
        DETACH DELETE exisitingSession

        CREATE (newSession:${NodeLabels.PostSession} {userId: $userId, sessionId: randomUUID()})

        MERGE (u)-[r:${RelationshipTypes.INITIALIZED_POST_SESSION}]->(newSession)

        WITH newSession
        CALL apoc.ttl.expireIn(newSession, 1, 'd')
        RETURN newSession
      `,
      params
    );

    const postNode = result.records[0]?.get("newSession")?.properties;

    return toNativeTypes(postNode);
  }

  async createPost(payload: CreatePostInput): Promise<Post | null> {
    const hashtags = extractHashtags(payload.caption);
    const mentions = extractMentions(payload.caption);

    const topicSlug = payload?.topicSlug
      ? slugify(payload.topicSlug, {
          lower: true,
          trim: true,
          remove: /[*+~.()'"!:@#]/g,
        })
      : "";

    const now = new Date();

    const params = {
      postId: payload.postId,
      userId: payload.userId,
      caption: payload.caption,
      files: payload?.files ?? [],
      timestamp: now.toISOString(),
      topicSlug,
      hashtags,
      mentions,
    };

    // Create the post
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})

        CREATE (p:${NodeLabels.Post} {
          id: $postId,
          caption: $caption,
          userId: u.id,
          createdAt: datetime($timestamp),
          likes: 0,
          comments: 0,
          shares: 0,
          isDeleted: false
        })

        // // Create user - post relationship
        MERGE (u)-[:${RelationshipTypes.POSTED}]->(p)

        WITH p, u

        // // match and delete session
        MATCH (session:${NodeLabels.PostSession} {sessionId: $postId})
        DETACH DELETE session

        // // Optional link to topic
        FOREACH (_ IN CASE WHEN $topicSlug <> "" THEN [1] ELSE [] END |
          MERGE (topic:${NodeLabels.Topic} {slug: $topicSlug})
          ON CREATE SET
            topic.popularity = 0,
            topic.createdAt = datetime($timestamp)

          MERGE (p)-[:${RelationshipTypes.BELONGS_TO}]->(topic)
          MERGE (u)-[r:${RelationshipTypes.INTERESTED_IN}]->(topic)
          ON CREATE SET
            r.interestLevel = 5,
            r.since = datetime($timestamp)
        )

        WITH p, u, COALESCE($hashtags, []) AS hashtags

        // Handle hashtags
        FOREACH (hashtag IN hashtags |
          MERGE (h:${NodeLabels.Hashtag} {slug: hashtag})
          ON CREATE SET 
            h.popularity = 0,
            h.createdAt = datetime($timestamp)
          SET h.popularity = COALESCE(h.popularity, 0) + 1,
              h.lastUsedAt = datetime($timestamp)

          MERGE (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(h)
          MERGE (u)-[r:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h)
          ON CREATE SET 
            r.interestLevel = 5,
            r.since = datetime()
        )
        
        WITH p, u, COALESCE($files,[]) AS files

        CALL {
          WITH p, u, files

          // // Create new file nodes
          UNWIND range(0, size(files)-1) AS idx
  
          WITH p, u, idx, files[idx] AS file //, COALESCE(files[idx].tags, []) AS tags
  
          CREATE (f:${NodeLabels.File})
            SET f.url = file.url, f.key = file.key, f.fileType = file.fileType
  
          // // Create post - file relationship
          MERGE (p)-[r:${RelationshipTypes.HAS_FILE}]->(f)
            SET r.order = idx
  
          WITH p, u, f, COALESCE(file.tags, []) AS tags
            // // create file - user tags
            CALL {
                WITH p, u, f, tags
                UNWIND tags AS tag
    
                MATCH(taggedUser:${NodeLabels.User} {id: tag.userId})
                OPTIONAL MATCH(taggedUser)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(u)
                WHERE blockedByUser IS NULL 

                WITH p, u, f, taggedUser, tag
    
                MERGE (f)-[tagRelationship:${RelationshipTypes.TAGGED}]->(taggedUser)
                ON CREATE SET
                  tagRelationship.positionX = COALESCE(tag.positionX,null),
                  tagRelationship.positionY = COALESCE(tag.positionY,null)
    
                // // create post - user mention
                MERGE (p)-[mentionRel:${RelationshipTypes.MENTIONED}]->(taggedUser)
                  ON CREATE SET mentionRel.timestamp = datetime($timestamp)

                WITH p, u, f, taggedUser, tag
                WHERE taggedUser.id <> u.id

                WITH p, u, f, taggedUser, tag
                
                CREATE (activity:${NodeLabels.Activity} {
                  id: randomUUID(), 
                  type: "${ActivityTypes.TAG}",
                  actorId: $userId,
                  targetId: p.id,
                  message: u.username + " tagged you in a post",
                  createdAt: datetime($timestamp)
                })
    
                CREATE (taggedUser)-[:${RelationshipTypes.HAS_ACTIVITY} {timestamp:$timestamp}]->(activity)
                WITH p AS post, u AS user, f AS file, activity
                CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'
                
                RETURN post, user, file
            }

          RETURN post, user, COLLECT(DISTINCT file) AS processedFiles
        }

        WITH post AS p, user AS u, COALESCE($mentions, []) AS mentions

        // // Handle user mentions
        CALL {
          WITH p, u, mentions

          UNWIND mentions AS mention

          MATCH(userMentioned:${NodeLabels.User} {username: mention})
          OPTIONAL MATCH(userMentioned)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(u)
          WHERE blockedByUser IS NULL AND userMentioned.id <> u.id

          MERGE (p)-[r:${RelationshipTypes.MENTIONED}]->(userMentioned)
            ON CREATE SET r.timestamp = datetime($timestamp)
        
          WITH p, u, userMentioned, mention
          WHERE userMentioned.id <> u.id

          CREATE (activity:${NodeLabels.Activity} {
            id: randomUUID(), 
            type: "${ActivityTypes.MENTIONED}",
            actorId: $userId,
            targetId: p.id,
            message: u.username + " mentioned you in a post",
            createdAt: datetime($timestamp)
          })

          CREATE (userMentioned)-[:${RelationshipTypes.HAS_ACTIVITY} {timestamp:$timestamp}]->(activity)
          WITH p AS post, mention, activity
          CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'

           RETURN post, COLLECT(mention) AS _mentions
         }

        RETURN post{.*} AS post
      `,
      params
    );

    try {
      const postNode = result.records[0]?.toObject()?.post;
      return toNativeTypes(postNode) as Post;
    } catch (error) {
      console.log("Error publishing post: ", error);
      return null;
    }
  }

  async deletePost(
    payload: { userId: string; postId: string } = { userId: "", postId: "" }
  ) {
    return await this.writeToDB(
      `
        MATCH (user: ${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.POSTED}]->(post:${NodeLabels.Post} {id: $postId})<-[:${RelationshipTypes.HAS_COMMENT}]-(comment:${NodeLabels.Comment})
        SET post.isDeleted = true, comment.isDeleted = true
        RETURN post
      `,
      payload
    );
  }

  async getPostCount(userId: string) {
    const result = await this.readFromDB(
      `
        MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(user:${NodeLabels.User} {id: $userId}) 
        RETURN COUNT(post) AS total
      `,
      { userId }
    );

    return valueToNativeType(result?.records?.[0]?.get("total")) ?? 0;
  }

  async getUserPostCount(currentUser: string = "", userId: string = "") {
    if (currentUser == userId) return;

    const result = await this.readFromDB(
      `
        OPTIONAL MATCH(currentUser:${NodeLabels.User} {id: $currentUser})
        OPTIONAL MATCH(user:${NodeLabels.User} {id: $userId})
        OPTIONAL MATCH(currentUser)-[blockedUser:${RelationshipTypes.BLOCKED}]->(user)
        OPTIONAL MATCH(user)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(currentUser)
        
        // Filter condition:
        // - The currentUser must not be null (the post must have a creator)
        // - The 'blockedUser' relationship must NOT exist (currentUser has not blocked postCreator)
        // - The 'blockedByUser' relationship must NOT exist (postCreator has not blocked currentUser)
        WHERE currentUser IS NOT NULL AND user IS NOT NULL 
          AND blockedUser IS NULL
          AND blockedByUser IS NULL

        MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(user) 
        RETURN COUNT(post) AS total
      `,
      { userId, currentUser }
    );

    return valueToNativeType(result?.records?.[0]?.get("total")) ?? 0;
  }

  // Likes
  async getPostLikes(postId: string) {
    const result = await this.readFromDB(
      `
        MATCH (p:${NodeLabels.Post} {id: $postId})<-[:${RelationshipTypes.LIKED}]-(u:${NodeLabels.User})
        return u
      `,
      {
        postId,
      }
    );

    return result.records.map((record) =>
      toDTO(record.get("u").properties, [
        "firstName",
        "lastName",
        "id",
        "email",
        "username",
      ])
    ) as IUser[];
  }

  async likePost(userId: string, postId: string) {
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (p:${NodeLabels.Post} {id: $postId, isDeleted: false})

        MERGE (u)-[r:${RelationshipTypes.LIKED}]->(p)
        ON CREATE SET r.timestamp = datetime($timestamp), p.likes = coalesce(p.likes, 0) + 1

        with p, u

        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p)
        OPTIONAL MATCH (p)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
        OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})
        ORDER BY r.order

        WITH p, u, creator, topic, COLLECT(hashtag.name) as hashtags, COLLECT(f) AS files

        WHERE creator.id <> u.id

        CREATE (activity:${NodeLabels.Activity} {
            id: randomUUID(), 
            type: "${ActivityTypes.LIKE}",
            actorId: $userId,
            targetId: p.id,
            message: u.username + " liked your post",
            createdAt: datetime($timestamp)
          })

        CREATE (creator)-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity)

        WITH p, u, creator, topic, hashtags, files, activity
        CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'

        RETURN p{.*, 
                  isMyPost: (creator.id = $userId), 
                  topic, 
                  hashtags, 
                  files, 
                  creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)}
               } as post
      `,
      {
        userId,
        postId,
        timestamp: new Date().toISOString(),
      }
    );

    return this.extractPost(result.records[0], userId);
  }

  async unlikePost(userId: string, postId: string) {
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.LIKED}]->(p:${NodeLabels.Post} {id: $postId, isDeleted: false})
        DELETE r
        SET p.likes = CASE WHEN p.likes > 0 THEN p.likes - 1 ELSE 0 END
        with p

        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p)
        OPTIONAL MATCH (p)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
        OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})
        ORDER BY r.order

        WITH p, creator, topic, COLLECT(hashtag.name) as hashtags, COLLECT(f) AS files, r

        RETURN topic, hashtags, files, {userId: creator.id, username: COALESCE(creator.username, creator.email)} AS creator,
          p {.*, isMyPost: (creator.id = $userId)} as post
      `,
      {
        userId,
        postId,
      }
    );

    return result.records.map((record) => this.extractPost(record, userId))[0];
  }

  // Comments
  async commentOnPost(userId: string, postId: string, comment: string) {
    const timestamp = new Date().toISOString();
    const hashtags = extractHashtags(comment) ?? [];
    const mentions = extractMentions(comment) ?? [];

    await this.writeToDB(
      `
      MATCH (u:${NodeLabels.User} {id: $userId})
      MATCH (p:${NodeLabels.Post} {id: $postId, isDeleted: false})<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})

      OPTIONAL MATCH(u)-[blockedUser:${RelationshipTypes.BLOCKED}]->(creator)
      OPTIONAL MATCH(u)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(creator)
      WHERE blockedUser IS NULL AND blockedByUser IS NULL
      
      CREATE (c:${NodeLabels.Comment} {
        id: randomUUID(),
        comment: $comment,
        likes: 0,
        createdAt: datetime($timestamp),
        updatedAt: datetime($timestamp),
        isRoot: true,
        isDeleted: false
      })
      
      MERGE (c)-[:${RelationshipTypes.COMMENTED_BY}]->(u)
      MERGE (p)-[:${RelationshipTypes.HAS_COMMENT}]->(c)
      MERGE (u)-[comment:${RelationshipTypes.COMMENTED_ON}]->(p)
      ON CREATE SET 
        comment.timestamp = datetime($timestamp),
        comment.isDeleted = false
      SET p.comments = coalesce(p.comments, 0) + 1

      WHERE creator.id <> u.id

      CREATE (activity:${NodeLabels.Activity} {
            id: randomUUID(), 
            type: "${ActivityTypes.COMMENT}",
            actorId: $userId,
            targetId: c.id,
            message: u.username + " commented on your post"
            createdAt: datetime($timestamp)
          })
    
      CREATE (creator)-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity)
      WITH p, u, c, activity
      CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'

      WITH p, u, c, COALESCE($mentions, []) AS mentions

      CALL {
          WITH p, u, c, mentions
          // // Handle user mentions
          UNWIND mentions AS mention
          MATCH(userMentioned:${NodeLabels.User} {username: mention})
          OPTIONAL MATCH(userMentioned)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(u)

          WHERE blockedByUser IS NULL AND userMentioned.id <> u.id

          MERGE (c)-[r:${RelationshipTypes.MENTIONED}]->(userMentioned)
              ON CREATE SET r.timestamp = datetime($timestamp)

          WITH p, u, c, userMentioned, mention
          WHERE userMentioned.id <> u.id

          CREATE (activity:${NodeLabels.Activity} {
              id: randomUUID(), 
              type: "${ActivityTypes.MENTIONED}",
              actorId: $userId,
              targetId: p.id,
              message: u.username + " commented on your post",
              createdAt: datetime($timestamp)
            })
        
          CREATE (userMentioned)-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity)
          WITH p, u, c, activity, mention
          CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'

          RETURN c AS user_comment, COLLECT(mention) AS user_mentions
      }

        RETURN user_comment{.*} AS comment
      `,
      { userId, postId, comment, timestamp, hashtags, mentions }
    );

    return {
      comment,
      timestamp: new Date(timestamp),
    };
  }

  async replyToComment(
    userId: string,
    postId: string,
    parentCommentId: string,
    comment: string
  ) {
    const timestamp = new Date().toISOString();
    const hashtags = extractHashtags(comment) ?? [];
    const mentions = extractMentions(comment) ?? [];

    return await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p:${NodeLabels.Post} {id: $postId, isDeleted: false})-[:${RelationshipTypes.HAS_COMMENT}]->(comment:${NodeLabels.Comment} {id: $parentCommentId, isDeleted: false})-[:${RelationshipTypes.COMMENTED_BY}]->(author:${NodeLabels.User})

        OPTIONAL MATCH(u)-[blockedCreator:${RelationshipTypes.BLOCKED}]->(creator)
        OPTIONAL MATCH(u)<-[blockedByCreator:${RelationshipTypes.BLOCKED}]-(creator)
        OPTIONAL MATCH(u)-[blockedCommenter:${RelationshipTypes.BLOCKED}]->(author)
        OPTIONAL MATCH(u)<-[blockedByCommenter:${RelationshipTypes.BLOCKED}]-(author)
        WHERE blockedCreator IS NULL AND blockedByCreator IS NULL AND blockedCommenter IS NULL AND blockedByCommenter IS NULL
        
        CREATE (reply:${NodeLabels.Comment} {
          id: randomUUID(),
          comment: $comment,
          likes: 0,
          createdAt: datetime($timestamp),
          updatedAt: datetime($timestamp),
          isDeleted: false
        })

        MERGE (u)-[:${RelationshipTypes.COMMENTED_ON}]->(p)
        MERGE (reply)-[:${RelationshipTypes.COMMENTED_BY}]->(u)
        MERGE (reply)-[:${RelationshipTypes.REPLIED_TO}]->(parent)
        MERGE (p)-[:${RelationshipTypes.HAS_COMMENT}]->(reply)

        SET p.comments = coalesce(p.comments, 0) + 1

        WHERE author.id <> u.id
        CREATE (activity:${NodeLabels.Activity} {
            id: randomUUID(), 
            type: "${ActivityTypes.REPLY}",
            actorId: $userId,
            targetId: reply.id,
            message: u.username + " replied your comment",
            createdAt: datetime($timestamp)
        })
  
        CREATE (author)-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity)
        WITH p, u, reply, activity
        CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'

        WITH p, u, reply, COALESCE($mentions, []) AS mentions

        CALL {
            WITH p, reply, u, mentions
            // // Handle user mentions
            UNWIND mentions AS mention
            MATCH(userMentioned:${NodeLabels.User} {username: mention})
            OPTIONAL MATCH(userMentioned)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(u)

            WHERE blockedByUser IS NULL AND userMentioned.id <> u.id
  
            MERGE (reply)-[r:${RelationshipTypes.MENTIONED}]->(userMentioned)
            ON CREATE SET r.timestamp = datetime($timestamp)

            WITH p, reply, u, mention, userMentioned

            CREATE (activity:${NodeLabels.Activity} {
                id: randomUUID(), 
                type: "${ActivityTypes.MENTIONED}",
                actorId: $userId,
                targetId: reply.id,
                message: u.username + " mentioned your in a comment",
                createdAt: datetime($timestamp)
            })
      
            CREATE (userMentioned)-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity)
            WITH activity
            CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'           
        }

        RETURN reply{.*} AS comment
      `,
      {
        userId,
        postId,
        parentCommentId,
        comment,
        timestamp,
        hashtags,
        mentions,
      }
    );
  }

  async likeAComment(userId: string, commentId: string) {
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p:${NodeLabels.Post} {isDeleted: false})-[:${RelationshipTypes.HAS_COMMENT}]->(comment:${NodeLabels.Comment} {id: $commentId, isDeleted: false})-[:${RelationshipTypes.COMMENTED_BY}]->(author:${NodeLabels.User})

        OPTIONAL MATCH(u)-[blockedCreator:${RelationshipTypes.BLOCKED}]->(creator)
        OPTIONAL MATCH(u)<-[blockedByCreator:${RelationshipTypes.BLOCKED}]-(creator)
        OPTIONAL MATCH(u)-[blockedCommenter:${RelationshipTypes.BLOCKED}]->(author)
        OPTIONAL MATCH(u)<-[blockedByCommenter:${RelationshipTypes.BLOCKED}]-(author)
        WHERE blockedCreator IS NULL AND blockedByCreator IS NULL AND blockedCommenter IS NULL AND blockedByCommenter IS NULL

        MERGE (u)-[r:${RelationshipTypes.LIKED}]->(comment)
        ON CREATE SET r.timestamp = datetime($timestamp), comment.likes = coalesce(comment.likes, 0) + 1

        WHERE author.id <> u.id

        CREATE (activity:${NodeLabels.Activity} {
            id: randomUUID(), 
            type: "${ActivityTypes.LIKE}",
            actorId: $userId,
            targetId: $commentId,
            message: u.username + " liked your comment",
            createdAt: datetime($timestamp)
        })
  
        CREATE (author)-[:${RelationshipTypes.HAS_ACTIVITY}]->(activity)

        WITH comment, activity
        CALL apoc.ttl.expireIn(activity, 70, 'd') // Changed 10 'w' to 70 'd'

        RETURN comment
      `,
      { userId, commentId, timestamp: new Date().toISOString() }
    );

    const comment = result.records[0]?.get("comment");

    if (!comment) {
      throw new ErrorResponse(
        "There was an error liking this comment",
        HttpStatusCode.BadRequest
      );
    }

    return valueToNativeType(comment);
  }

  async unlikeAComment(userId: string, commentId: string) {
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.LIKED}]->(c:${NodeLabels.Comment} {id: $commentId, isDeleted: false})
        DELETE r
        SET c.likes = CASE WHEN c.likes > 0 THEN c.likes - 1 ELSE 0 END

        RETURN r, c AS comment
      `,
      {
        userId,
        commentId,
      }
    );

    const comment = valueToNativeType(result.records[0]?.get("comment"));

    if (!comment) {
      throw new ErrorResponse(
        "There was an error unliking this comment",
        HttpStatusCode.BadRequest
      );
    }

    return comment;
  }

  async deleteComment(userId: string, commentId: string) {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})<-[:${RelationshipTypes.COMMENTED_BY}]-(c:${NodeLabels.Comment} {id: $commentId, isDeleted: false})
        MATCH (p:${NodeLabels.Post})-[:${RelationshipTypes.HAS_COMMENT}]->(c)
        SET p.comments = CASE WHEN p.comments > 0 THEN p.comments - 1 ELSE 0 END
        DETACH DELETE c
      `,
      { userId, commentId }
    );
  }

  async getPostComments(
    params: IReadQueryParams & { postId: string; userId: string }
  ) {
    const results = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (post:${NodeLabels.Post} {id: $postId, isDeleted: false})-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
       
        OPTIONAL MATCH(u)-[blockedUser:${RelationshipTypes.BLOCKED}]->(creator)
        OPTIONAL MATCH(u)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(creator)
        WHERE blockedUser IS NULL AND blockedByUser IS NULL

        OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_COMMENT}]->(c:${NodeLabels.Comment} {isDeleted: false, isRoot:true })
        OPTIONAL MATCH (c)-[:${RelationshipTypes.COMMENTED_BY}]->(author: ${NodeLabels.User})
        
        RETURN c{.*, 
          author:{
            userId: author.id,
            username: author.username,
            avatar: author.avatar
          }
        } AS comment

        ORDER BY comment.createdAt DESC
      `,
      params
    );

    return results.records
      .map((record) => {
        if (Boolean(record)) {
          const comment = valueToNativeType(record?.get("comment"));
          return comment;
        }
      })
      .filter((v) => Boolean(v));
  }

  async getPostCommentReplies(
    params: IReadQueryParams & {
      postId: string;
      commentId: string;
      userId: string;
    }
  ) {
    const results = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (post:${NodeLabels.Post} {id: $postId, isDeleted: false})-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
       
        OPTIONAL MATCH(u)-[blockedUser:${RelationshipTypes.BLOCKED}]->(creator)
        OPTIONAL MATCH(u)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(creator)
        WHERE blockedUser IS NULL AND blockedByUser IS NULL

        OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_COMMENT}]->(c:${NodeLabels.Comment} { isDeleted: false, isRoot:true })<-:${RelationshipTypes.REPLIED_TO}-(reply:${NodeLabels.Comment} { isDeleted: false })
        OPTIONAL MATCH (reply)-[:${RelationshipTypes.COMMENTED_BY}]->(author: ${NodeLabels.User})

        LIMIT $limit
        SKIP $skip
        
        RETURN reply{.*, 
          author:{
            userId: author.id,
            username: author.username,
            avatar: author.avatar
          }
        } AS comment

        ORDER BY comment.createdAt DESC
      `,
      params
    );

    return results.records
      .map((record) => {
        if (Boolean(record)) {
          const comment = valueToNativeType(record?.get("comment"));
          return comment;
        }
      })
      .filter((v) => Boolean(v));
  }

  async getHashtagPosts({
    userId,
    hashtag,
    ...params
  }: IReadQueryParams & {
    userId: string;
    hashtag: string;
  }) {
    const cypherQuery = `
      MATCH (u:${NodeLabels.User} {id: $userId})
      MATCH (hashtag:${NodeLabels.Hashtag} {slug: toLower($hashtag)})<-[${RelationshipTypes.HAS_HASHTAG}]-
      (post:${NodeLabels.Post} {isDeleted:false})<-[${RelationshipTypes.POSTED}]-
      (creator:${NodeLabels.User})

      OPTIONAL MATCH(post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
      OPTIONAL MATCH(u)<-[liked:${RelationshipTypes.LIKED}]-(post)
      OPTIONAL MATCH(u)-[blockedUser:${RelationshipTypes.BLOCKED}]->(creator)
      OPTIONAL MATCH(u)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(creator)

      WHERE u IS NOT NULL AND post IS NOT NULL AND creator IS NOT NULL AND blockedByUser IS NULL AND blockedUser IS NULL

      WITH u, creator, post, topic, liked, size(COLLECT(DISTINCT post)) AS totalCount
      SKIP $skip
      LIMIT $limit


      OPTIONAL MATCH (post)-[mentionRel:${RelationshipTypes.MENTIONED}]->(mentionedUser:${NodeLabels.User})

      WITH u, post, creator, topic, liked,  totalCount,
          COLLECT(DISTINCT CASE WHEN mentionedUser IS NOT NULL OR mentionRel IS NULL THEN {username: mentionedUser.username, userId: mentionedUser.id} ELSE NULL END) AS mentions

      OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
       WITH u, post, creator, topic, liked, totalCount, mentions,
        COLLECT(DISTINCT hashtag.slug) AS hashtags

      OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(files:${NodeLabels.File})
      ORDER BY r.order

      UNWIND files AS file
      OPTIONAL MATCH (file)-[tagRel:${RelationshipTypes.TAGGED}]->(taggedUser:${NodeLabels.User})
      WITH u, post, creator, topic, liked, totalCount, mentions, hashtags, file,
      COLLECT(DISTINCT CASE WHEN taggedUser IS NOT NULL OR tagRel IS NULL THEN 
      {
        username: taggedUser.username, 
        userId: taggedUser.id, 
        positionX: COALESCE(tagRel.positionX, 0), 
        positionY: COALESCE(tagRel.positionY, 0)
      }
      ELSE NULL END) AS tags

      WITH u, post, creator, liked, topic, hashtags, mentions, totalCount, COLLECT({
          url: file.url,
          fileType: file.fileType,
          tags: [ t IN tags WHERE t.username IS NOT NULL ]
        }) AS files


      RETURN totalCount,
            post {.*, 
              isMyPost: (creator.id = $userId),
              liked,
              files,
              mentions,
              creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)}
              } as post

        ORDER BY post.createdAt DESC
    `;

    const { result, pagination } = await this.readFromDB(
      cypherQuery,
      {
        userId,
        hashtag,
        ...params,
      },
      true
    );

    const posts = result.records
      .map((record: any) => {
        return this.extractPost(record, userId);
      })
      .filter(Boolean); // Filter out any null entries if they occurred

    return { posts, pagination };
  }

  async getPostById(
    params: {
      userId: string;
      postId: string;
    } = { userId: "", postId: "" }
  ) {
    const cypherQuery = `
      MATCH(u:${NodeLabels.User} {id: $userId})
      MATCH (post:${NodeLabels.Post} {id:$postId, isDeleted: false})<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
      OPTIONAL MATCH(u)-[blockedUser:${RelationshipTypes.BLOCKED}]->(creator)
      OPTIONAL MATCH(u)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(creator)

      WHERE blockedUser IS NULL AND blockedByUser IS NULL

      OPTIONAL MATCH (post)<-[liked:${RelationshipTypes.LIKED}]-(u)
      OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})

      WITH u, post, creator, liked, topic
      
      OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
      WITH u, post, creator, liked, topic,
        COLLECT(DISTINCT hashtag.slug) AS hashtags
        
      OPTIONAL MATCH (post)-[mentionRel:${RelationshipTypes.MENTIONED}]->(mentionedUser:${NodeLabels.User})
       WITH u, post, creator, liked, topic, hashtags,
          COLLECT(DISTINCT CASE WHEN mentionedUser IS NOT NULL OR mentionRel IS NULL THEN {username: mentionedUser.username, userId: mentionedUser.id} ELSE NULL END) AS mentions


      OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(files:${NodeLabels.File})
      ORDER BY r.order

      UNWIND files AS file
      OPTIONAL MATCH (file)-[tagRel:${RelationshipTypes.TAGGED}]->(taggedUser:${NodeLabels.User})
      WITH u, post, creator, liked, topic, hashtags, mentions, file,
      COLLECT(DISTINCT CASE WHEN taggedUser IS NOT NULL OR tagRel IS NULL THEN 
      {
        username: taggedUser.username, 
        userId: taggedUser.id, 
        positionX: COALESCE(tagRel.positionX, 0), 
        positionY: COALESCE(tagRel.positionY, 0)
      }
      ELSE NULL END) AS tags

      WITH u, post, creator, liked, topic, hashtags, mentions, COLLECT({
          url: file.url,
          fileType: file.fileType,
          tags: [ t IN tags WHERE t.username IS NOT NULL ]
        }) AS files

      RETURN post {.*, 
                isMyPost: (creator.id = $userId),
                topic,
                liked,
                hashtags,
                files,
                mentions,
                creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)}
              } as post
    `;

    const result = await this.readFromDB(cypherQuery, params);
    const post = this.extractPost(result.records[0]);
    return post;
  }

  // Get posts
  async getFeed(
    userId: string,
    params: IReadQueryParams = {},
    type: "following" | "spotlight"
  ): Promise<{ posts: any[]; pagination: IPagination }> {
    // const { skip = 0, limit = 10 } = params; // Default skip and limit

    let cypherQuery: string;
    let queryParams: Record<string, any> = { ...params, userId };

    if (type === "spotlight") {
      cypherQuery = `
          MATCH (u:${NodeLabels.User} {id: $userId})
          OPTIONAL MATCH (topicPost:${NodeLabels.Post} {isDeleted: false})-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})<-[interest:${RelationshipTypes.INTERESTED_IN}]-(u)
          OPTIONAL MATCH (hashtagPost:${NodeLabels.Post} {isDeleted: false})<-[:${RelationshipTypes.HAS_HASHTAG}]-(hashtag:${NodeLabels.Hashtag})<-[:${RelationshipTypes.FOLLOWS_HASHTAG}]-(u)
          OPTIONAL MATCH (u)-[:${RelationshipTypes.POSTED}]->(userPost:${NodeLabels.Post} {isDeleted: false})

          WITH u,
              COLLECT(DISTINCT { post: topicPost, topicScore: interest.interestLevel }) AS topicResults,
              COLLECT(DISTINCT hashtagPost) AS hashtagPosts,
              COLLECT(DISTINCT userPost) AS userPosts

          WITH u, topicResults,
              [result IN topicResults | result.post] AS topicPosts,
              hashtagPosts, userPosts

          WITH u, topicResults, hashtagPosts,
              apoc.coll.toSet(topicPosts + hashtagPosts + userPosts) AS allPotentialPosts
          
          // Filter out posts from blocked users or users who blocked the current user
          UNWIND allPotentialPosts AS post

          OPTIONAL MATCH (post)<-[:${RelationshipTypes.POSTED}]-(postCreator:${NodeLabels.User})
          // Check if the current user (u) has blocked the postCreator
          OPTIONAL MATCH (u)-[blockedUser:${RelationshipTypes.BLOCKED}]->(postCreator)

          // Check if the postCreator has blocked the current user (u)
          OPTIONAL MATCH (postCreator)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(u)

          // Filter condition:
          // - The postCreator must not be null (the post must have a creator)
          // - The 'blockedUser' relationship must NOT exist (currentUser has not blocked postCreator)
          // - The 'blockedByUser' relationship must NOT exist (postCreator has not blocked currentUser)
          WHERE postCreator IS NOT NULL
            AND blockedUser IS NULL
            AND blockedByUser IS NULL

          // filtered posts
          WITH u, topicResults, hashtagPosts, COLLECT(DISTINCT post) AS allPosts, size(COLLECT(DISTINCT post)) AS totalCount // Re-collect allPosts after filtering

          UNWIND allPosts AS post

          // compute scores
          WITH u, post, topicResults, hashtagPosts, totalCount,
              REDUCE(score = 0, r IN topicResults | CASE WHEN r.post = post THEN COALESCE(r.topicScore, 0) ELSE score END) AS topicScore,
              CASE WHEN post IN hashtagPosts THEN 1 ELSE 0 END AS hashtagScore

          WITH u, post, topicScore, hashtagScore, totalCount,
              topicScore * 0.7 + hashtagScore * 0.3 AS relevanceScore
          ORDER BY relevanceScore DESC, post.createdAt DESC
          SKIP $skip
          LIMIT $limit

          OPTIONAL MATCH (post)<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
          OPTIONAL MATCH (post)<-[liked:${RelationshipTypes.LIKED}]-(u)
          OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})

          WITH u, post, creator, relevanceScore, liked, topic, totalCount
          
          OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
          WITH u, post, creator, relevanceScore, liked, topic, totalCount,
            COLLECT(DISTINCT hashtag.slug) AS hashtags
            
          OPTIONAL MATCH (post)-[mentionRel:${RelationshipTypes.MENTIONED}]->(mentionedUser:${NodeLabels.User})
          WITH u, post, creator, relevanceScore, liked, topic, totalCount, hashtags,
              COLLECT(DISTINCT CASE WHEN mentionedUser IS NOT NULL OR mentionRel IS NULL THEN {username: mentionedUser.username, userId: mentionedUser.id} ELSE NULL END) AS mentions


          OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(files:${NodeLabels.File})
          ORDER BY r.order

          UNWIND files AS file
          OPTIONAL MATCH (file)-[tagRel:${RelationshipTypes.TAGGED}]->(taggedUser:${NodeLabels.User})
          WITH u, post, creator, relevanceScore, liked, topic, totalCount, hashtags, mentions, file,
          COLLECT(DISTINCT CASE WHEN taggedUser IS NOT NULL OR tagRel IS NULL THEN 
          {
            username: taggedUser.username, 
            userId: taggedUser.id, 
            positionX: COALESCE(tagRel.positionX, 0), 
            positionY: COALESCE(tagRel.positionY, 0)
          }
          ELSE NULL END) AS tags
          
          WITH u, post, creator, relevanceScore, liked, topic, totalCount, hashtags, mentions, COLLECT({
            url: file.url,
            fileType: file.fileType,
            tags: [ t IN tags WHERE t.username IS NOT NULL ]
          }) AS files
                 
          RETURN totalCount,
              post {.*, 
                isMyPost: (creator.id = $userId),
                topic,
                liked,
                hashtags,
                files,
                mentions,
                creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)}
                } as post
          ORDER BY relevanceScore DESC, post.createdAt DESC
        `;
    } else {
      cypherQuery = `
        MATCH (u:${NodeLabels.User} {id: $userId})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(followedUser:${NodeLabels.User})
        OPTIONAL MATCH (u)<-[blockedByUserRel:${RelationshipTypes.BLOCKED}]-(followedUser)
        OPTIONAL MATCH (u)-[blockedUserRel:${RelationshipTypes.BLOCKED}]->(followedUser)
        
        WHERE followedUser IS NOT NULL AND blockedByUserRel IS NULL AND blockedUserRel IS NULL
        WITH u, followedUser

        OPTIONAL MATCH (u)-[:${RelationshipTypes.POSTED}]->(myPost:${NodeLabels.Post} {isDeleted: false})
        OPTIONAL MATCH (followedUser)-[:${RelationshipTypes.POSTED}]->(followedPost:${NodeLabels.Post} {isDeleted: false})

        WITH u, COLLECT(DISTINCT followedPost) AS followedPosts

        UNWIND followedPosts AS post
          
        // WHERE post IS NOT NULL

        WITH u, COLLECT(DISTINCT post) AS allPosts, size(COLLECT(DISTINCT post)) AS totalCount // Re-collect allPosts after filtering
          
        WITH u, allPosts, totalCount
              
        SKIP $skip
        LIMIT $limit

        UNWIND allPosts AS post

        OPTIONAL MATCH (post)<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
        OPTIONAL MATCH (post)<-[liked:${RelationshipTypes.LIKED}]-(u)
        OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})

        WITH u, post, creator, liked, topic, totalCount
        
        OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
        WITH u, post, creator, liked, topic, totalCount,
          COLLECT(DISTINCT hashtag.slug) AS hashtags
          
        OPTIONAL MATCH (post)-[mentionRel:${RelationshipTypes.MENTIONED}]->(mentionedUser:${NodeLabels.User})
        WITH u, post, creator, liked, topic, totalCount, hashtags,
            COLLECT(DISTINCT CASE WHEN mentionedUser IS NOT NULL THEN {username: mentionedUser.username, userId: mentionedUser.id} ELSE NULL END) AS mentions


        OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(files:${NodeLabels.File})
        ORDER BY r.order

        UNWIND files AS file
        OPTIONAL MATCH (file)-[tagRel:${RelationshipTypes.TAGGED}]->(taggedUser:${NodeLabels.User})
        WITH u, post, creator, liked, topic, totalCount, hashtags, mentions, file,
        COLLECT(DISTINCT CASE WHEN taggedUser IS NOT NULL OR tagRel IS NULL THEN 
        {
          username: taggedUser.username, 
          userId: taggedUser.id, 
          positionX: COALESCE(tagRel.positionX, 0), 
          positionY: COALESCE(tagRel.positionY, 0)
        }
        ELSE NULL END) AS tags

        WITH u, post, creator, liked, topic, totalCount, hashtags, mentions, //COLLECT(file) AS files
        COLLECT({
          url: file.url,
          fileType: file.fileType,
          tags: [ t IN tags WHERE t.username IS NOT NULL ]
        }) AS files
                
        RETURN totalCount,
            post {.*, 
              isMyPost: (creator.id = $userId),
              topic,
              liked,
              hashtags,
              files,
              mentions,
              creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)}
              } as post

        ORDER BY post.createdAt DESC
      `;
    }

    const { result, pagination } = await this.readFromDB(
      cypherQuery,
      queryParams,
      true
    );

    const posts = result.records
      .map((record: any) => {
        return this.extractPost(record, userId);
      })
      .filter(Boolean); // Filter out any null entries if they occurred

    return { posts, pagination };
  }

  // Get logged in user posts
  async getMyPosts(
    userId: string,
    params: IReadQueryParams = {}
  ): Promise<{ posts: any[]; pagination: IPagination }> {
    let cypherQuery: string;
    let queryParams: Record<string, any>;

    cypherQuery = `
      MATCH (post: ${NodeLabels.Post} {isDeleted: false})<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User} {id: $userId})
      
      WHERE post IS NOT NULL
      WITH creator, COLLECT(DISTINCT post) AS allPosts, size(COLLECT(DISTINCT post)) AS totalCount
      
      WITH allPosts, creator, totalCount
      
      UNWIND allPosts AS post
      SKIP $skip
      LIMIT $limit

      OPTIONAL MATCH (creator)-[liked:${RelationshipTypes.LIKED}]->(post)

      OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
      WITH post, liked, creator, totalCount,
      COLLECT(DISTINCT hashtag.slug) AS hashtags

      OPTIONAL MATCH (post)-[:${RelationshipTypes.MENTIONED}]->(mentionedUser:${NodeLabels.User})
      WITH post, liked, creator, totalCount, hashtags,
      COLLECT(DISTINCT {username: mentionedUser.username, userId: mentionedUser.id}) AS mentions
      
      OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
      OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(file:${NodeLabels.File})
      ORDER BY r.order


      OPTIONAL MATCH (file)-[tagRel:${RelationshipTypes.TAGGED}]->(taggedUser:${NodeLabels.User})
      WITH post, creator, totalCount, topic, liked, hashtags, mentions, file,
      COLLECT(DISTINCT {
        username: taggedUser.username, 
        userId: taggedUser.id, 
        positionX: COALESCE(tagRel.positionX, 0), 
        positionY: COALESCE(tagRel.positionY, 0)
      }) AS tags

      WITH post, creator, totalCount, topic, liked, hashtags, mentions, COLLECT({
        url: file.url,
        fileType: file.fileType,
        tags: [ t IN tags WHERE t.username IS NOT NULL ]
      }) AS files
      
      
      RETURN  totalCount,
      post {.*, 
          isMyPost: true, 
          topic, 
          liked, 
          hashtags, 
          files,
          mentions,
          creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)} 
        } as post

      ORDER BY post.createdAt DESC
    `;
    queryParams = { userId, ...params };

    const { result, pagination } = await this.readFromDB(
      cypherQuery,
      queryParams,
      true
    );

    const posts = result.records
      .map((record: any) => {
        return this.extractPost(record, userId);
      })
      .filter(Boolean); // Filter out any null entries if they occurred

    return { posts, pagination };
  }

  // Get user posts
  async getUserPosts(
    loggedInUserId: string = "",
    userToMatchId: string = "",
    params: IReadQueryParams = {}
  ): Promise<{ posts: any[]; pagination: IPagination }> {
    let cypherQuery: string;
    let queryParams: Record<string, any>;

    if (loggedInUserId == userToMatchId) {
      return this.getMyPosts(loggedInUserId, params);
    }

    cypherQuery = `
      MATCH (loggedInUser: ${NodeLabels.User} {id: $loggedInUserId})
      MATCH (userToMatch: ${NodeLabels.User} {id: $userToMatchId})
      
      WHERE loggedInUser IS NOT NULL AND userToMatch IS NOT NULL 
      
      WITH userToMatch AS creator
      
      OPTIONAL MATCH (loggedInUser)-[blockedUser:${RelationshipTypes.BLOCKED}]->(creator)
      OPTIONAL MATCH (loggedInUser)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(creator)
      MATCH (post: ${NodeLabels.Post} {isDeleted: false})<-[:${RelationshipTypes.POSTED}]-(creator)
      
      WHERE post IS NOT NULL AND blockedUser IS NULL AND blockedByUser IS NULL
      WITH creator, COLLECT(DISTINCT post) AS allPosts, size(COLLECT(DISTINCT post)) AS totalCount
      
      WITH allPosts, creator, totalCount
      
      UNWIND allPosts AS post

      SKIP $skip
      LIMIT $limit

      WITH post, creator, totalCount

      OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
      WITH post, creator, totalCount,
      COLLECT(DISTINCT hashtag.slug) AS hashtags
      
      OPTIONAL MATCH (post)-[mentionRel:${RelationshipTypes.MENTIONED}]->(mentionedUser:${NodeLabels.User})
      WITH post, creator, totalCount, hashtags, mentionRel, mentionedUser // Keep mentionedUser for the filter
      WHERE mentionedUser IS NOT NULL OR mentionRel IS NULL 
      WITH post, creator, totalCount, hashtags,
          COLLECT(DISTINCT CASE WHEN mentionedUser IS NOT NULL THEN {username: mentionedUser.username, userId: mentionedUser.id} ELSE NULL END) AS mentions


      OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
      OPTIONAL MATCH (u)-[liked:${RelationshipTypes.LIKED}]->(post)
      OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(files:${NodeLabels.File})
      ORDER BY r.order

      UNWIND files AS file
      OPTIONAL MATCH (file)-[tagRel:${RelationshipTypes.TAGGED}]->(taggedUser:${NodeLabels.User})
      WITH post, creator, totalCount, topic, liked, hashtags, mentions, file, tagRel, taggedUser // Keep mentionedUser for the filter
      WHERE taggedUser IS NOT NULL OR tagRel IS NULL 
      WITH post, creator, totalCount, topic, liked, hashtags, mentions, file,
      COLLECT(DISTINCT {
        username: taggedUser.username, 
        userId: taggedUser.id, 
        positionX: COALESCE(tagRel.positionX, 0), 
        positionY: COALESCE(tagRel.positionY, 0)
      }) AS tags

      WITH post, creator, totalCount, topic, liked, hashtags, mentions, COLLECT({
        url: file.url,
        fileType: file.fileType,
        tags: [ t IN tags WHERE t.username IS NOT NULL ]
      }) AS files

      RETURN  totalCount,
      post {.*, 
          isMyPost: (creator.id = $loggedInUserId),
          topic, 
          liked, 
          hashtags, 
          files,
          mentions,
          creator: {userId: creator.id, username: COALESCE(creator.username, creator.email)} 
        } as post

      ORDER BY post.createdAt DESC
    `;

    queryParams = { userToMatchId, loggedInUserId, ...params };

    const { result, pagination } = await this.readFromDB(
      cypherQuery,
      queryParams,
      true
    );

    const posts = result.records
      .map((record: any) => {
        return this.extractPost(record, loggedInUserId);
      })
      .filter(Boolean); // Filter out any null entries if they occurred

    return { posts, pagination };
  }

  async sharePost(userId: string, postId: string): Promise<void> {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (p:${NodeLabels.Post} {postId: $postId, isDeleted: false})
        CREATE (u)-[r:${RelationshipTypes.ENGAGES_WITH}]->(p)
        SET r.engagementType = 'share',
            r.timestamp = datetime($timestamp)
        SET p.shares = p.shares + 1
      `,
      {
        userId,
        postId,
        timestamp: new Date().toISOString(),
      }
    );
  }

  async reportPost(
    currentUserId: string = "",
    postToReportId: string = "",
    reason: string = ""
  ) {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (postToReport: ${NodeLabels.Post} {id: $postToReportId, isDeleted:false})

      WHERE currentUser IS NOT NULL AND postToReport IS NOT NULL

      MERGE (currentUser)-[r:${RelationshipTypes.REPORTED_POST} {timestamp: datetime($timestamp)}]->(postToReport)
      ON CREATE SET
        r.reason = $reason
      
      RETURN postToReport
    `;

    await this.writeToDB(query, {
      currentUserId,
      postToReportId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  // Example: Update interest level based on engagement
  async updateInterestLevel(
    userId: string,
    topicSlug: string,
    engagement: "like" | "comment" | "share"
  ) {
    const boostValue = {
      like: 0.1,
      comment: 0.3,
      share: 0.5,
    }[engagement];

    await this.writeToDB(
      `
      MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.INTERESTED_IN}]->(t:${NodeLabels.Topic} {slug: $topicSlug})
      SET r.interestLevel = CASE 
        WHEN r.interestLevel + $boost > 10 THEN 10 
        ELSE r.interestLevel + $boost 
      END
      `,
      { userId, topicSlug, boost: boostValue }
    );
  }
}

export const postService = new PostService();
