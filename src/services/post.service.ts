import { CreatePostInput, Post } from "@/models";
import { v4 as uuidv4 } from "uuid";
import BaseService from "./base.service";

class PostService extends BaseService {
  async createPost(input: CreatePostInput): Promise<Post> {
    const postId = uuidv4();
    const now = new Date();

    // Create the post
    const result = await this.writeToDB(
      `
        MATCH (u:User {userId: $userId})
        CREATE (p:Post {
          postId: $postId,
          content: $content,
          createdAt: datetime($createdAt),
          likes: 0,
          comments: 0,
          shares: 0
        })
        CREATE (u)-[:CREATES]->(p)
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
          MATCH (p:Post {postId: $postId})
          MATCH (t:Topic {topicId: $topicId})
          CREATE (p)-[:BELONGS_TO]->(t)
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
            MATCH (p:Post {postId: $postId})
            MERGE (h:Hashtag {name: $hashtagName})
            ON CREATE SET h.hashtagId = $hashtagId, h.popularity = 0
            CREATE (p)-[:HAS]->(h)
            SET h.popularity = h.popularity + 1
          `,
          {
            postId,
            hashtagName: cleanName,
            hashtagId: uuidv4(),
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

  async getPersonalizedFeed(userId: string, limit = 20): Promise<any[]> {
    const result = await this.readFromDB(
      `
        MATCH (u:User {userId: $userId})
        OPTIONAL MATCH (u)-[:FOLLOWS]->(followedUser:User)-[:CREATES]->(followedPost:Post)
        OPTIONAL MATCH (u)-[:INTERESTED_IN]->(topic:Topic)<-[:BELONGS_TO]-(topicPost:Post)
        OPTIONAL MATCH (u)-[:FOLLOWS]->(hashtag:Hashtag)<-[:HAS]-(hashtagPost:Post)
        
        WITH u, 
             COLLECT(DISTINCT followedPost) as followedPosts,
             COLLECT(DISTINCT topicPost) as topicPosts,
             COLLECT(DISTINCT hashtagPost) as hashtagPosts
        
        UNWIND (followedPosts + topicPosts + hashtagPosts) as post
        WHERE post IS NOT NULL
        
        MATCH (creator:User)-[:CREATES]->(post)
        OPTIONAL MATCH (post)-[:BELONGS_TO]->(topic:Topic)
        OPTIONAL MATCH (post)-[:HAS]->(hashtag:Hashtag)
        
        WITH post, creator, topic, COLLECT(hashtag.name) as hashtags,
             CASE 
               WHEN post IN followedPosts THEN 3
               WHEN post IN topicPosts THEN 2
               WHEN post IN hashtagPosts THEN 1
               ELSE 0
             END as relevanceScore
        
        RETURN post, creator, topic, hashtags, relevanceScore
        ORDER BY relevanceScore DESC, post.createdAt DESC
        LIMIT $limit
      `,
      { userId, limit }
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
        MATCH (p:Post {postId: $postId})
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
        MATCH (p:Post {postId: $postId})
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
      MATCH (u:User {id: $userId})-[r:INTERESTED_IN]->(t:Topic {slug: $topicSlug})
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
