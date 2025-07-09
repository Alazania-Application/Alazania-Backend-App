import { CreatePostInput, IUser, Post } from "@/models";
import BaseService from "./base.service";
import { NodeLabels, RelationshipTypes } from "@/enums";
import {
  ErrorResponse,
  extractHashtags,
  IPagination,
  IReadQueryParams,
  toDTO,
  toNativeTypes,
  valueToNativeType,
} from "@/utils";
import { deleteFolderByPrefix } from "@/middlewares/upload.middleware";
import { HttpStatusCode } from "axios";

class PostService extends BaseService {
  private extractPost = (record: Record<any, any>, userId?: string) => {
    const post = record?.get("post");
    const creator = record?.get("creator");
    const topic = record?.get("topic");
    const hashtags = record?.get("hashtags")?.properties ?? [];
    const liked = Boolean(!!record?.get("liked"));
    const files = record
      ?.get("files")
      ?.map((record: any) => record?.properties);

    if (post) {
      return toNativeTypes({
        id: post?.properties?.id,
        caption: post?.properties?.caption,
        createdAt: post?.properties?.createdAt,
        files,
        engagement: {
          likes: post?.properties?.likes?.toInt(),
          comments: post?.properties?.comments?.toInt(),
          shares: post?.properties?.shares?.toInt(),
        },
        creator: {
          userId: creator?.properties?.id,
          username: creator?.properties?.username ?? creator?.properties?.email,
        },
        topic: topic ? topic?.properties?.name : null,
        hashtags,
        liked,
        isMyPost: Boolean(creator?.properties?.id == userId),
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
      console.log({
        post: results.records[0]?.get("post")?.properties,
      });
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

    const now = new Date();

    const params = {
      postId: payload.postId,
      userId: payload.userId,
      caption: payload.caption,
      files: payload?.files ?? [],
      createdAt: now.toISOString(),
      topicSlug: payload?.topicSlug || null,
      hashtags,
    };

    // Create the post
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})

        CREATE (p:${NodeLabels.Post} {
          id: $postId,
          caption: $caption,
          userId: $userId,
          createdAt: datetime($createdAt),
          likes: 0,
          comments: 0,
          shares: 0,
          isDeleted: false
        })

        // // Create user - post relationship
        MERGE (u)-[:${RelationshipTypes.POSTED}]->(p)

        WITH p

        // // Optional link to topic
        OPTIONAL MATCH (t:${NodeLabels.Topic} {slug: $topicSlug})
        FOREACH (_ IN CASE WHEN t IS NOT NULL THEN [1] ELSE [] END |
          MERGE (p)-[:${RelationshipTypes.BELONGS_TO}]->(t)
        )

        WITH p, $postId AS sessionID
        // // Optional match and delete session
        OPTIONAL MATCH (session:${NodeLabels.PostSession} {sessionId: sessionID})
        FOREACH (_ IN CASE WHEN session IS NOT NULL THEN [1] ELSE [] END |
          DETACH DELETE session
        )


        WITH p, $files AS files

        // // Create new file nodes
        UNWIND range(0, size(COALESCE(files, []))-1) AS idx
        WITH p, files[idx] AS file, idx
        CREATE (f:${NodeLabels.File})
        SET f = file

        // // Create post <-> file relationship
        MERGE (p)-[r:${RelationshipTypes.HAS_FILE}]->(f)
        SET r.order = idx
        
        WITH p, $hashtags AS hashtags

        UNWIND COALESCE(hashtags, []) AS hashtag
        MERGE (h:${NodeLabels.Hashtag} {name: hashtag})
        ON CREATE SET 
              h.popularity = 0,
              h.lastUsedAt = datetime($createdAt)

        // // Create post <-> hashtags relationship
        MERGE (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(h)
        SET 
          h.popularity = h.popularity + 1,
          h.lastUsedAt = datetime($createdAt)
        
        RETURN p
      `,
      params
    );

    const postNode = result.records[0];

    return this.extractPost(postNode) as Post;
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

        with p

        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p)
        OPTIONAL MATCH (p)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
        OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})

        WITH p, creator, topic, COLLECT(hashtag.name) as hashtags, COLLECT(f) AS files,  r
        ORDER BY r.order

        RETURN p, creator, topic, hashtags, files
      `,
      {
        userId,
        postId,
        timestamp: new Date().toISOString(),
      }
    );

    return result.records.map((record) => this.extractPost(record, userId))[0];
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

        WITH p, creator, topic, COLLECT(hashtag.name) as hashtags, COLLECT(f) AS files,  r
        ORDER BY r.order

        RETURN p, creator, topic, hashtags, files
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
    const createdAt = new Date().toISOString();

    await this.writeToDB(
      `
      MATCH (u:${NodeLabels.User} {id: $userId})
      MATCH (p:${NodeLabels.Post} {id: $postId, isDeleted: false})
      
      CREATE (c:${NodeLabels.Comment} {
        id: randomUUID(),
        comment: $comment,
        likes: 0,
        createdAt: datetime($createdAt),
        updatedAt: datetime($createdAt)
      })
      
      MERGE (c)-[:${RelationshipTypes.COMMENTED_BY}]->(u)
      MERGE (p)-[:${RelationshipTypes.HAS_COMMENT}]->(c)
      MERGE (u)-[comment:${RelationshipTypes.COMMENTED_ON}]->(p)
      ON CREATE SET 
        comment.timestamp = datetime($createdAt),
        comment.isDeleted = false

      SET p.comments = coalesce(p.comments, 0) + 1
      `,
      { userId, postId, comment, createdAt }
    );

    return {
      comment,
      createdAt: new Date(createdAt),
    };
  }

  async replyToComment(
    userId: string,
    postId: string,
    parentCommentId: string,
    comment: string
  ) {
    const createdAt = new Date().toISOString();

    return await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (p:${NodeLabels.Post} {id: $postId, isDeleted: false})
        MATCH (parent:${NodeLabels.Comment} {id: $parentCommentId, isDeleted: false})
        
        CREATE (reply:${NodeLabels.Comment} {
          id: randomUUID(),
          comment: $comment,
          createdAt: datetime($createdAt),
          updatedAt: datetime($createdAt),
          isDeleted: false
        })

        MERGE (u)-[:${RelationshipTypes.COMMENTED_ON}]->(p)
        MERGE (reply)-[:${RelationshipTypes.COMMENTED_BY}]->(u)
        MERGE (reply)-[:${RelationshipTypes.REPLIED_TO}]->(parent)
        MERGE (p)-[:${RelationshipTypes.HAS_COMMENT}]->(reply)

        SET p.comments = coalesce(p.comments, 0) + 1
        RETURN reply.id AS commentId
      `,
      { userId, postId, parentCommentId, comment, createdAt }
    );
  }

  async likeAComment(userId: string, commentId: string) {
    return await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (c:${NodeLabels.Comment} {id: $commentId, isDeleted: false})
        MERGE (u)-[r:${RelationshipTypes.LIKED}]->(c)
        ON CREATE SET r.timestamp = datetime($timestamp), c.likes = coalesce(c.likes, 0) + 1

        RETURN c.id AS commentId
      `,
      { userId, commentId }
    );
  }

  async unlikeAComment(userId: string, commentId: string) {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.LIKED}]->(c:${NodeLabels.Comment} {id: $commentId, isDeleted: false})
        DELETE r
        SET c.likes = CASE WHEN c.likes > 0 THEN c.likes - 1 ELSE 0 END
      `,
      {
        userId,
        commentId,
      }
    );
  }

  async deleteComment(userId: string, commentId: string) {
    return await this.writeToDB(
      `
      MATCH (u:${NodeLabels.User} {id: $userId})<-[:${RelationshipTypes.COMMENTED_BY}]-(c:${NodeLabels.Comment} {id: $commentId})
      MATCH (p:${NodeLabels.Post})-[:${RelationshipTypes.HAS_COMMENT}]->(c)
      SET c.isDeleted = true, p.comments = CASE WHEN p.comments > 0 THEN p.comments - 1 ELSE 0 END
      `,
      { userId, commentId }
    );
  }

  async getPostComments(postId: string) {
    const results = await this.readFromDB(
      `
        MATCH (p:${NodeLabels.Post} {id: $postId})-[:${RelationshipTypes.HAS_COMMENT}]->(c:${NodeLabels.Comment} {isDeleted: false})
        OPTIONAL MATCH (c)-[:${RelationshipTypes.COMMENTED_BY}]->(u: ${NodeLabels.User})
        RETURN c, u
        ORDER BY c.createdAt ASC
      `,
      {
        postId,
      }
    );

    return results.records.map((record) => ({
      comment: toNativeTypes(record.get("c").properties),
      author: toNativeTypes(
        toDTO(record.get("u")?.properties ?? null, [
          "firstName",
          "lastName",
          "avatar",
          "username",
        ])
      ),
    }));
  }

  // Get posts
  async getFeed(
    userId: string,
    params: IReadQueryParams = {},
    type: "following" | "spotlight"
  ): Promise<{ posts: any[]; pagination: IPagination }> {
    const { skip = 0, limit = 10 } = params; // Default skip and limit

    let cypherQuery: string;
    let queryParams: Record<string, any>;

    if (type === "spotlight") {
      //   cypherQuery = `
      //   MATCH (u:${NodeLabels.User} {id: $userId})

      //   OPTIONAL MATCH (u)-[interest:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})<-[:${RelationshipTypes.BELONGS_TO}]-(topicPost:${NodeLabels.Post} {isDeleted: false})
      //   OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS_HASHTAG}]
      //   ->(hashtag:${NodeLabels.Hashtag})
      //   <-[:${RelationshipTypes.HAS_HASHTAG}]
      //   -(hashtagPost:${NodeLabels.Post} {isDeleted: false})

      //   WITH u,
      //       COLLECT(DISTINCT { post: topicPost, topicScore: interest.interestLevel }) AS topicResults,
      //       COLLECT(DISTINCT hashtagPost) as hashtagPosts

      //   // Combine all posts, avoiding duplicates
      //   WITH u, topicResults, hashtagPosts,
      //       [result IN topicResults | result.post] AS topicPosts

      //   WITH u, topicResults, hashtagPosts, topicPosts,
      //       apoc.coll.toSet(topicPosts + hashtagPosts) AS allPosts

      //   UNWIND allPosts AS post

      //   // Get topicScore if present, else 0
      //   WITH u, post, topicResults,
      //       REDUCE(score = 0, r IN topicResults | CASE WHEN r.post = post THEN COALESCE(r.topicScore, 0) ELSE score END) AS topicScore,
      //       CASE WHEN post IN hashtagPosts THEN 1 ELSE 0 END AS hashtagScore

      //   WITH u, post, topicScore, hashtagScore,
      //       topicScore * 0.7 + hashtagScore * 0.3 AS relevanceScore
      //   SKIP $skip
      //   LIMIT $limit

      //   // Get additional data for display
      //   CALL {
      //     WITH post, relevanceScore
      //     OPTIONAL MATCH (post)<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
      //     OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
      //     OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
      //     OPTIONAL MATCH (u)-[liked:${RelationshipTypes.LIKED}]->(post)

      //     WITH post, creator, topic, liked, hashtag, relevanceScore

      //     OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})
      //     ORDER BY r.order
      //     RETURN post, creator, topic, liked, relevanceScore,
      //           COLLECT(DISTINCT hashtag.name) AS hashtags,
      //           COLLECT(f) AS files
      //   }

      //   WITH post, creator, topic, liked, hashtags, relevanceScore, files

      //   // OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})
      //   // WITH post, creator, topic, liked, hashtags, relevanceScore, COLLECT(f) AS files, r
      //   // ORDER BY r.order

      //   RETURN post, creator, topic, liked, hashtags, relevanceScore, files
      //   ORDER BY relevanceScore DESC, post.createdAt DESC
      // `;

      cypherQuery = `
          MATCH (u:${NodeLabels.User} {id: $userId})
          OPTIONAL MATCH (u)-[interest:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})
                          <-[:${RelationshipTypes.BELONGS_TO}]-(topicPost:${NodeLabels.Post} {isDeleted: false})
          OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS_HASHTAG}]
                          ->(hashtag:${NodeLabels.Hashtag})
                          <-[:${RelationshipTypes.HAS_HASHTAG}]
                          -(hashtagPost:${NodeLabels.Post} {isDeleted: false})

          WITH u,
              COLLECT(DISTINCT { post: topicPost, topicScore: interest.interestLevel }) AS topicResults,
              COLLECT(DISTINCT hashtagPost) AS hashtagPosts

          WITH u, topicResults,
              [result IN topicResults | result.post] AS topicPosts,
              hashtagPosts

          WITH u, topicResults, hashtagPosts,
              apoc.coll.toSet(topicPosts + hashtagPosts) AS allPotentialPosts
          
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

          // now load details for these posts
          CALL {
            WITH u, post
            OPTIONAL MATCH (post)<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
            OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
            OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
            OPTIONAL MATCH (u)-[liked:${RelationshipTypes.LIKED}]->(post)
            OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})
            ORDER BY r.order
            
            WITH post, creator, topic, liked,
                COLLECT(DISTINCT hashtag.name) AS hashtags,
                COLLECT(f) AS files
                
            RETURN post AS innerPost, creator, topic, liked, hashtags, files
          }

          RETURN innerPost AS post, creator, topic, liked, hashtags, files, relevanceScore, totalCount
          ORDER BY relevanceScore DESC, post.createdAt DESC
        `;
      queryParams = { userId, skip, limit };
    } else {
      cypherQuery = `
        MATCH (u:${NodeLabels.User} {id: $userId})-[:${RelationshipTypes.POSTED}]->(myPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(followedUser:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(followedPost:${NodeLabels.Post} {isDeleted: false})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})<-[:${RelationshipTypes.BELONGS_TO}]-(topicPost:${NodeLabels.Post} {isDeleted: false})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(hashtag:${NodeLabels.Hashtag})<-[:${RelationshipTypes.HAS_HASHTAG}]-(hashtagPost:${NodeLabels.Post} {isDeleted: false})

        WITH u,
              COLLECT(DISTINCT myPost) as myPosts,
              COLLECT(DISTINCT followedPost) as followedPosts,
              COLLECT(DISTINCT topicPost) as topicPosts,
              COLLECT(DISTINCT hashtagPost) as hashtagPosts
        SKIP $skip
        LIMIT $limit
        
        UNWIND apoc.coll.toSet(followedPosts + topicPosts + hashtagPosts + myPosts) as post
        WITH u, post, followedPosts, topicPosts, hashtagPosts, myPosts
        WHERE post IS NOT NULL
        
        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(post)
        OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
        OPTIONAL MATCH (u)-[liked:${RelationshipTypes.LIKED}]->(post)
        
        WITH post, creator, topic, liked, COLLECT(hashtag.name) as hashtags,
              CASE
                WHEN post IN followedPosts THEN 3
                WHEN post IN topicPosts THEN 2
                WHEN post IN hashtagPosts THEN 1
                ELSE 0
              END as relevanceScore

        OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(f:${NodeLabels.File})
        WITH post, creator, topic, liked, hashtags, relevanceScore, COLLECT(f) AS files, r
        ORDER BY r.order

        RETURN post, creator, topic, liked, hashtags, relevanceScore, files
        ORDER BY post.createdAt DESC, relevanceScore DESC
      `;
      queryParams = { userId, skip, limit };
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

  // Get user posts
  async getUserPosts(
    userId: string,
    params: IReadQueryParams = {}
  ): Promise<{ posts: any[]; pagination: IPagination }> {
    const { skip = 0, limit = 10 } = params; // Default skip and limit

    let cypherQuery: string;
    let queryParams: Record<string, any>;

    cypherQuery = `
      MATCH (post: ${NodeLabels.Post} {isDeleted: false})<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User} {id: $userId})
      ORDER BY post.createdAt DESC
      SKIP $skip
      LIMIT $limit
      WITH post, creator

      OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
      OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
      OPTIONAL MATCH (u)-[liked:${RelationshipTypes.LIKED}]->(post)
      OPTIONAL MATCH (post)-[r:${RelationshipTypes.HAS_FILE}]->(files:${NodeLabels.File})
      WITH post, creator, topic, liked, COLLECT(DISTINCT hashtag.name) AS hashtags, COLLECT(files) AS orderedFiles, r
      ORDER BY r.order
      

      RETURN post, creator, topic, liked, hashtags, orderedFiles AS files
    `;
    queryParams = { userId, skip, limit };

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
