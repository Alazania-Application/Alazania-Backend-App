import { CreatePostInput, IUser, Post } from "@/models";
import BaseService from "./base.service";
import { NodeLabels, RelationshipTypes } from "@/enums";
import {
  extractHashtags,
  IReadQueryParams,
  toDTO,
  toNativeTypes,
} from "@/utils";

class PostService extends BaseService {
  async createPost(payload: CreatePostInput): Promise<Post | null> {
    const hashtags = extractHashtags(payload.content);

    const now = new Date();

    const params = {
      userId: payload.userId,
      content: payload.content,
      createdAt: now.toISOString(),
      topicId: payload?.topicId || null,
      hashtags,
    };

    // Create the post
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        OPTIONAL MATCH (t:${NodeLabels.Topic} {id: $topicId})
        WITH u, t

        CREATE (p:${NodeLabels.Post} {
          id: randomUUID(),
          content: $content,
          createdAt: datetime($createdAt),
          likes: 0,
          comments: 0,
          shares: 0
        })

        MERGE (u)-[:${RelationshipTypes.POSTED}]->(p)
        
        // Optional link to topic
        FOREACH (_ IN CASE WHEN t IS NOT NULL THEN [1] ELSE [] END |
          MERGE (p)-[:${RelationshipTypes.BELONGS_TO}]->(t)
        )

        WITH p

        UNWIND COALESCE($hashtags, []) AS hashtag
        MERGE (h:${NodeLabels.Hashtag} {name: hashtag})
        ON CREATE SET 
              h.popularity = 0,
              h.lastUsedAt = datetime($createdAt)

        MERGE (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(h)
        SET 
          h.popularity = h.popularity + 1,
          h.lastUsedAt = datetime($createdAt)

        RETURN p
      `,
      params
    );

    const postNode = result.records[0].get("p");

    return toNativeTypes({
      id: postNode?.properties?.id,
      content: postNode?.properties?.content,
      createdAt: postNode?.properties?.createdAt,
      engagement: {
        likes: postNode?.properties?.likes,
        comments: postNode?.properties?.comments,
        shares: postNode?.properties?.shares,
      },
    }) as Post;
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
        MATCH (p:${NodeLabels.Post} {id: $postId})

        MERGE (u)-[r:${RelationshipTypes.LIKED}]->(p)
        ON CREATE SET r.timestamp = datetime($timestamp), p.likes = coalesce(p.likes, 0) + 1

        with p

        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p)
        OPTIONAL MATCH (p)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})

        WITH p, creator, topic, COLLECT(hashtag.name) as hashtags

        RETURN p, creator, topic, hashtags
      `,
      {
        userId,
        postId,
        timestamp: new Date().toISOString(),
      }
    );

    return result.records.map((record) => {
      const post = record.get("p");
      const creator = record.get("creator");
      const topic = record.get("topic");
      const hashtags = record.get("hashtags");

      if (post) {
        return toNativeTypes({
          id: post?.properties?.id,
          content: post?.properties?.content,
          createdAt: post?.properties?.createdAt,
          engagement: {
            likes: post?.properties?.likes,
            comments: post?.properties?.comments,
            shares: post?.properties?.shares,
          },
          creator: {
            userId: creator?.properties?.id,
            username: creator?.properties?.username,
          },
          topic: topic
            ? {
                topicId: topic?.properties?.topicId,
                name: topic?.properties?.name,
              }
            : null,
          hashtags: hashtags || [],
        });
      }
    })[0];
  }

  async unlikePost(userId: string, postId: string) {
    const result = await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.LIKED}]->(p:${NodeLabels.Post} {id: $postId})
        DELETE r
        SET p.likes = CASE WHEN p.likes > 0 THEN p.likes - 1 ELSE 0 END
        with p

        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(p)
        OPTIONAL MATCH (p)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})

        WITH p, creator, topic, COLLECT(hashtag.name) as hashtags

        RETURN p, creator, topic, hashtags
      `,
      {
        userId,
        postId,
      }
    );

    return result.records.map((record) => {
      const post = record.get("p");
      const creator = record.get("creator");
      const topic = record.get("topic");
      const hashtags = record.get("hashtags");

      if (post) {
        return toNativeTypes({
          id: post?.properties?.id,
          content: post?.properties?.content,
          createdAt: post?.properties?.createdAt,
          engagement: {
            likes: post?.properties?.likes,
            comments: post?.properties?.comments,
            shares: post?.properties?.shares,
          },
          creator: {
            userId: creator?.properties?.id,
            username: creator?.properties?.username,
          },
          topic: topic
            ? {
                topicId: topic?.properties?.topicId,
                name: topic?.properties?.name,
              }
            : null,
          hashtags: hashtags || [],
        });
      }
    })[0];
  }

  // Comments
  async commentOnPost(userId: string, postId: string, content: string) {
    const createdAt = new Date().toISOString();

    await this.writeToDB(
      `
      MATCH (u:${NodeLabels.User} {id: $userId})
      MATCH (p:${NodeLabels.Post} {id: $postId})
      
      CREATE (c:${NodeLabels.Comment} {
        id: randomUUID(),
        content: $content,
        likes: 0,
        createdAt: datetime($createdAt),
        updatedAt: datetime($createdAt)
      })
      
      MERGE (c)-[:${RelationshipTypes.COMMENTED_BY}]->(u)
      MERGE (p)-[:${RelationshipTypes.HAS_COMMENT}]->(c)
      MERGE (u)-[comment:${RelationshipTypes.COMMENTED_ON}]->(p)
      ON CREATE SET 
        comment.timestamp = datetime($createdAt)


      SET p.comments = coalesce(p.comments, 0) + 1
      `,
      { userId, postId, content, createdAt }
    );

    return {
      content,
      createdAt: new Date(createdAt),
    };
  }

  async replyToComment(
    userId: string,
    postId: string,
    parentCommentId: string,
    content: string
  ) {
    const createdAt = new Date().toISOString();

    return await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (p:${NodeLabels.Post} {id: $postId})
        MATCH (parent:${NodeLabels.Comment} {id: $parentCommentId})
        
        CREATE (reply:${NodeLabels.Comment} {
          id: randomUUID(),
          content: $content,
          createdAt: datetime($createdAt),
          updatedAt: datetime($createdAt)
        })

        MERGE (u)-[:${RelationshipTypes.COMMENTED_ON}]->(p)
        MERGE (reply)-[:${RelationshipTypes.COMMENTED_BY}]->(u)
        MERGE (reply)-[:${RelationshipTypes.REPLIED_TO}]->(parent)
        MERGE (p)-[:${RelationshipTypes.HAS_COMMENT}]->(reply)

        SET p.comments = coalesce(p.comments, 0) + 1
        RETURN reply.id AS commentId
      `,
      { userId, postId, parentCommentId, content, createdAt }
    );
  }

  async likeAComment(userId: string, commentId: string) {
    return await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (c:${NodeLabels.Comment} {id: $commentId})
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
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.LIKED}]->(c:${NodeLabels.Comment} {id: $commentId})
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
      SET c.content = '[deleted]', c.deleted = true, p.comments = CASE WHEN p.comments > 0 THEN p.comments - 1 ELSE 0 END
      `,
      { userId, commentId }
    );
  }

  async getPostComments(postId: string) {
    const results = await this.readFromDB(
      `
        MATCH (p:${NodeLabels.Post} {id: $postId})-[:${RelationshipTypes.HAS_COMMENT}]->(c:${NodeLabels.Comment})
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

  async getFollowingFeed(
    userId: string,
    params: IReadQueryParams = {}
  ): Promise<any[]> {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[:${RelationshipTypes.POSTED}]->(myPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(followedUser:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(followedPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})<-[:${RelationshipTypes.BELONGS_TO}]-(topicPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(hashtag:${NodeLabels.Hashtag})<-[:${RelationshipTypes.HAS_HASHTAG}]-(hashtagPost:${NodeLabels.Post})
        
        WITH u, 
             COLLECT(DISTINCT myPost) as myPosts,
             COLLECT(DISTINCT followedPost) as followedPosts,
             COLLECT(DISTINCT topicPost) as topicPosts,
             COLLECT(DISTINCT hashtagPost) as hashtagPosts
        
        UNWIND (followedPosts + topicPosts + hashtagPosts + myPosts) as post
        WITH u, post, followedPosts, topicPosts, hashtagPosts, myPosts
        WHERE post IS NOT NULL
        
        MATCH (creator:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(post)
        OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})
        
        WITH post, creator, topic, COLLECT(hashtag.name) as hashtags,
             CASE 
               WHEN post IN followedPosts THEN 3
               WHEN post IN topicPosts THEN 2
               WHEN post IN hashtagPosts THEN 1
               ELSE 0
             END as relevanceScore
        
        RETURN post, creator, topic, hashtags, relevanceScore
        ORDER BY relevanceScore DESC , post.createdAt DESC
        SKIP $skip
        LIMIT $limit
      `,
      { userId, ...params }
    );

    return result.records.map((record) => {
      const post = record.get("post");
      const creator = record.get("creator");
      const topic = record.get("topic");
      const hashtags = record.get("hashtags");

      if (post) {
        return toNativeTypes({
          id: post?.properties?.id,
          content: post?.properties?.content,
          createdAt: post?.properties?.createdAt,
          engagement: {
            likes: post?.properties?.likes,
            comments: post?.properties?.comments,
            shares: post?.properties?.shares,
          },
          creator: {
            userId: creator?.properties?.id,
            username: creator?.properties?.username,
          },
          topic: topic
            ? {
                topicId: topic?.properties?.topicId,
                name: topic?.properties?.name,
              }
            : null,
          hashtags: hashtags || [],
        });
      }
    });
  }

  async getPersonalizedFeed(
    userId: string,
    params: IReadQueryParams = {}
  ): Promise<any[]> {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})

        OPTIONAL MATCH (u)-[interest:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})<-[:${RelationshipTypes.BELONGS_TO}]-(topicPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(hashtag:${NodeLabels.Hashtag})<-[:${RelationshipTypes.HAS_HASHTAG}]-(hashtagPost:${NodeLabels.Post})
        
        WITH u, 
            COLLECT(DISTINCT { post: topicPost, topicScore: interest.interestLevel }) AS topicResults,
            COLLECT(DISTINCT hashtagPost) as hashtagPosts
        
        // Flatten posts into one list, adding default scores where missing
        UNWIND topicResults AS topicResult
        WITH u, topicResult.post AS post, topicResult.topicScore AS topicScore, hashtagPosts

        WITH u, post, 
            COALESCE(topicScore, 0) AS topicScore,
            CASE WHEN post IN hashtagPosts THEN 1 ELSE 0 END AS hashtagScore

        // Calculate weighted relevance
        WITH u, post, topicScore, hashtagScore,
            topicScore * 0.7 + hashtagScore * 0.3 AS relevanceScore

        // Get additional data for display
        OPTIONAL MATCH (post)<-[:${RelationshipTypes.POSTED}]-(creator:${NodeLabels.User})
        OPTIONAL MATCH (post)-[:${RelationshipTypes.BELONGS_TO}]->(topic:${NodeLabels.Topic})
        OPTIONAL MATCH (post)-[:${RelationshipTypes.HAS_HASHTAG}]->(hashtag:${NodeLabels.Hashtag})

        WITH post, creator, topic, COLLECT(DISTINCT hashtag.name) AS hashtags, relevanceScore

        RETURN post, creator, topic, hashtags, relevanceScore
        ORDER BY relevanceScore DESC, post.createdAt DESC
        SKIP $skip
        LIMIT $limit
      `,
      { userId, ...params }
    );

    return result.records.map((record) => {
      const post = record.get("post");
      const creator = record.get("creator");
      const topic = record.get("topic");
      const hashtags = record.get("hashtags");

      if (post) {
        return toNativeTypes({
          id: post?.properties?.id,
          content: post?.properties?.content,
          createdAt: post?.properties?.createdAt,
          engagement: {
            likes: post?.properties?.likes,
            comments: post?.properties?.comments,
            shares: post?.properties?.shares,
          },
          creator: {
            userId: creator?.properties?.id,
            username: creator?.properties?.username,
          },
          topic: topic
            ? {
                topicId: topic?.properties?.topicId,
                name: topic?.properties?.name,
              }
            : null,
          hashtags: hashtags || [],
        });
      }
    });
  }

  async sharePost(userId: string, postId: string): Promise<void> {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        MATCH (p:${NodeLabels.Post} {postId: $postId})
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
