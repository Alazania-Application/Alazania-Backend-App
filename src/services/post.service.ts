import { CreatePostInput, Post } from "@/models";
import { v4 as uuidv4 } from "uuid";
import BaseService from "./base.service";
import { NodeLabels, RelationshipTypes } from "@/enums";
import { IReadQueryParams } from "@/utils";

class PostService extends BaseService {
  async createPost(input: CreatePostInput): Promise<Post> {
    const postId = uuidv4();
    const now = new Date();

    // Create the post
    const result = await this.writeToDB(
      `
        MATCH (u:User {userId: $userId})
        CREATE (p:${NodeLabels.Post} {
          postId: $postId,
          content: $content,
          createdAt: datetime($createdAt),
          likes: 0,
          comments: 0,
          shares: 0
        })
        CREATE (u)-[:${RelationshipTypes.POSTED}]->(p)
        RETURN p
      `,
      {
        userId: input.userId,
        postId,
        content: input.content,
        createdAt: now.toISOString(),
      }
    );

    // Link to topic if provided
    if (input.topicId) {
      await this.writeToDB(
        `
          MATCH (p:${NodeLabels.Post} {postId: $postId})
          MATCH (t:${NodeLabels.Topic} {topicId: $topicId})
          WHERE t IS NOT NULL 
          CREATE (p)-[:${RelationshipTypes.BELONGS_TO}]->(t)
        `,
        { postId, topicId: input.topicId }
      );
    }

    // Link to hashtags if provided
    if (input.hashtags && input.hashtags.length > 0) {
      for (const hashtagName of input.hashtags) {
        const cleanName = hashtagName.startsWith("#")
          ? hashtagName.slice(1)
          : hashtagName;
        await this.writeToDB(
          `
            MATCH (p:${NodeLabels.Post} {postId: $postId})
            MERGE (h:${NodeLabels.Hashtag} {name: $hashtagName})
            ON CREATE SET 
              h.hashtagId = $hashtagId, 
              h.popularity = 0,
              h.lastUsedAt = datetime($lastUsedAt)
            CREATE (p)-[:${RelationshipTypes.HAS_HASHTAG}]->(h)
            SET 
              h.popularity = h.popularity + 1
              h.lastUsedAt = datetime($lastUsedAt)
          `,
          {
            postId,
            hashtagName: cleanName,
            hashtagId: uuidv4(),
            lastUsedAt: now.toISOString()
          }
        );
      }
    }

    const postNode = result.records[0].get("p");
    return {
      postId: postNode.properties.postId,
      content: postNode.properties.content,
      createdAt: new Date(postNode.properties.createdAt),
      engagement: {
        likes: postNode.properties.likes,
        comments: postNode.properties.comments,
        shares: postNode.properties.shares,
      },
    };
  }

  async getFollowingFeed(
    userId: string,
    params: IReadQueryParams = {}
  ): Promise<any[]> {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {userId: $userId})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(followedUser:${NodeLabels.User})-[:${RelationshipTypes.POSTED}]->(followedPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})<-[:${RelationshipTypes.BELONGS_TO}]-(topicPost:${NodeLabels.Post})
        OPTIONAL MATCH (u)-[:${RelationshipTypes.FOLLOWS}]->(hashtag:${NodeLabels.Hashtag})<-[:${RelationshipTypes.HAS_HASHTAG}]-(hashtagPost:${NodeLabels.Post})
        
        WITH u, 
             COLLECT(DISTINCT followedPost) as followedPosts,
             COLLECT(DISTINCT topicPost) as topicPosts,
             COLLECT(DISTINCT hashtagPost) as hashtagPosts
        
        UNWIND (followedPosts + topicPosts + hashtagPosts) as post
        WITH u, post, followedPosts, topicPosts, hashtagPosts
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

      return {
        postId: post.properties.postId,
        content: post.properties.content,
        createdAt: new Date(post.properties.createdAt),
        engagement: {
          likes: post.properties.likes,
          comments: post.properties.comments,
          shares: post.properties.shares,
        },
        creator: {
          userId: creator.properties.userId,
          username: creator.properties.username,
        },
        topic: topic
          ? {
              topicId: topic.properties.topicId,
              name: topic.properties.name,
            }
          : null,
        hashtags: hashtags || [],
      };
    });
  }

  async getPersonalizedFeed(
    userId: string,
    params: IReadQueryParams = {}
  ): Promise<any[]> {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {userId: $userId})

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

      return {
        postId: post.properties.postId,
        content: post.properties.content,
        createdAt: new Date(post.properties.createdAt),
        engagement: {
          likes: post.properties.likes,
          comments: post.properties.comments,
          shares: post.properties.shares,
        },
        creator: {
          userId: creator.properties.userId,
          username: creator.properties.username,
        },
        topic: topic
          ? {
              topicId: topic.properties.topicId,
              name: topic.properties.name,
            }
          : null,
        hashtags: hashtags || [],
      };
    });
  }

  async likePost(userId: string, postId: string): Promise<void> {
    await this.writeToDB(
      `
        MATCH (u:User {userId: $userId})
        MATCH (p:${NodeLabels.Post} {postId: $postId})
        MERGE (u)-[r:ENGAGES_WITH]->(p)
        SET r.engagementType = 'like',
            r.timestamp = datetime($timestamp)
        SET p.likes = p.likes + 1
      `,
      {
        userId,
        postId,
        timestamp: new Date().toISOString(),
      }
    );
  }

  async sharePost(userId: string, postId: string): Promise<void> {
    await this.writeToDB(
      `
        MATCH (u:User {userId: $userId})
        MATCH (p:${NodeLabels.Post} {postId: $postId})
        CREATE (u)-[r:ENGAGES_WITH]->(p)
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
      MATCH (u:User {id: $userId})-[r:INTERESTED_IN]->(t:${NodeLabels.Topic} {slug: $topicSlug})
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
