import { CreateHashtagInput, Hashtag } from "@/models";
import { v4 as uuidv4 } from "uuid";
import BaseService from "./base.service";
import slugify from "slugify";
import { topics } from "@/data";
import { NodeLabels, RelationshipTypes } from "@/enums";

class HashtagService extends BaseService {
  seedHashtagsAndTopics = async () => {
    const existingHashtags = await this.readFromDB(`
      MATCH(h:${NodeLabels.Hashtag})
      RETURN h.slug
    `);

    if (existingHashtags?.records?.length) {
      console.log("Hashtags and Topics already seeded to the DB");
      return;
    }

    const allHashtagPromises: Promise<any>[] = [];

    topics.forEach((topic) => {
      const topicSlug = slugify(topic.name, {
        trim: true,
        lower: true,
      });
      const topicName = String(topic.name).trim();

      const topicPromise = this.writeToDB(
        `
          MERGE (topic:${NodeLabels.Topic} {slug: $topicSlug})
          ON CREATE SET
            topic.name = $topicName,
            topic.description = $description,
            topic.popularity = 0
          ON MATCH SET
            topic.name = $topicName,
            topic.description = $description,
        `,
        {
          topicName,
          topicSlug,
          description: topic.description,
        }
      );

      allHashtagPromises.push(topicPromise);
      // Link to hashtags if provided
      if (topic.hashtags && topic.hashtags.length > 0) {
        topic.hashtags.forEach((hashtag) => {
          const hashtagName = hashtag.startsWith("#")
            ? hashtag.slice(1)
            : hashtag;

          const hashtagSlug = slugify(hashtag, {
            trim: true,
            lower: true,
            remove: /#/gi,
          });

          const hashtagPromise = this.writeToDB(
            `
              MERGE (hashtag:${NodeLabels.Hashtag} {slug: $hashtagSlug})
              ON CREATE SET 
                hashtag.popularity = 0,
                hashtag.name = $hashtagName
              ON MATCH SET 
                hashtag.name = $hashtagName
              MERGE (topic:${NodeLabels.Topic} {slug: $topicSlug})
             

              MERGE (topic)-[r:${RelationshipTypes.CONTAINS}]->(hashtag)
              SET r.relevance = $relevance
            `,
            {
              hashtagSlug,
              hashtagName,
              topicSlug,
              relevance: 5,
            }
          );
          allHashtagPromises.push(hashtagPromise);
        });
      }
    });

    await Promise.all(allHashtagPromises);
    console.log("Hashtags have been seeded to the DB");
  };

  createHashtag = async (inputs: CreateHashtagInput[]): Promise<any> => {
    const allHashtagPromises: Promise<any>[] = [];

    inputs.forEach((hashtag) => {
      const hashtagName = hashtag.name.startsWith("#")
        ? hashtag.name.slice(1)
        : hashtag;

      const hashtagSlug = slugify(hashtag.name, {
        trim: true,
        lower: true,
        remove: /#/gi,
      });

      const hashtagPromise = this.writeToDB(
        `
          MERGE (hashtag:${NodeLabels.Hashtag} {slug: $hashtagSlug})
          ON CREATE SET 
            hashtag.popularity = 0,
            hashtag.name = $hashtagName
          ON MATCH SET 
            hashtag.name = $hashtagName
        `,
        {
          hashtagSlug,
          hashtagName,
        }
      );

      allHashtagPromises.push(hashtagPromise);
    });

    await Promise.all(allHashtagPromises);
  };

  linkHashtagToTopic = async (
    hashtagId: string,
    topicSlug: string,
    relevance = 5
  ): Promise<void> => {
    await this.writeToDB(
      `
        MATCH (h:${NodeLabels.Hashtag} {hashtagId: $hashtagId})
        MATCH (t:${NodeLabels.Topic} {slug: $topicSlug})
        MERGE (t)-[r:${RelationshipTypes.CONTAINS}]->(h)
        SET r.relevance = $relevance
      `,
      { hashtagId, topicSlug, relevance }
    );
  };

  followHashtags = async (
    userId: string,
    hashtagSlugs: string
  ): Promise<void> => {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        UNWIND $hashtagSlugs AS hashtagSlug
        MERGE (h:${NodeLabels.Hashtag} {slug: hashtagSlug})
        MERGE (u)-[r:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h)
        SET r.followedAt = datetime($followedAt)
        WITH u, t, r

        // Only increment popularity if this is a new follow

        WHERE NOT EXISTS {
          MATCH (u)-[:${RelationshipTypes.FOLLOWS_HASHTAG}]->(t)
          WHERE r IS NOT NULL
        }
        SET h.popularity = coalesce(h.popularity, 0) + 1
      `,
      {
        userId,
        hashtagSlugs,
        followedAt: new Date().toISOString(),
      }
    );
  };

  unfollowHashtag = async (
    userId: string,
    hashtagId: string
  ): Promise<void> => {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {userId: $userId})-[r:FOLLOWS]->(h:${NodeLabels.Hashtag} {hashtagId: $hashtagId})
        DELETE r
      `,
      { userId, hashtagId }
    );

    // Update hashtag popularity
    await this.writeToDB(
      `
        MATCH (h:${NodeLabels.Hashtag} {hashtagId: $hashtagId})
        SET h.popularity = CASE WHEN h.popularity > 0 THEN h.popularity - 1 ELSE 0 END
      `,
      { hashtagId }
    );
  };

  getHashtagsByTopic = async (topicSlug: string): Promise<Hashtag[]> => {
    const result = await this.readFromDB(
      `
        MATCH (t:${NodeLabels.Topic} {slug: $topicSlug})-[:${RelationshipTypes.CONTAINS}]->(h:${NodeLabels.Hashtag})
        RETURN h
        ORDER BY h.popularity DESC
      `,
      { topicSlug }
    );

    return result.records.map((record) => {
      const hashtagNode = record.get("h")?.properties as Hashtag;
      return {
        hashtagId: hashtagNode?.hashtagId,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
      };
    });
  };

  getUserFollowedHashtags = async (userId: string): Promise<Hashtag[]> => {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h:${NodeLabels.Hashtag})
        RETURN h
        ORDER BY h.popularity DESC
      `,
      { userId }
    );

    return result.records.map((record) => {
      const hashtagNode = record.get("h")?.properties as Hashtag;
      return {
        hashtagId: hashtagNode?.hashtagId,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
      };
    });
  };

  getTrendingHashtags = async (limit = 20): Promise<Hashtag[]> => {
    const result = await this.readFromDB(
      `
        MATCH (h:${NodeLabels.Hashtag})
        RETURN h
        ORDER BY h.popularity DESC
        LIMIT $limit
      `,
      { limit }
    );

    return result.records.map((record) => {
      const hashtagNode = record.get("h")?.properties as Hashtag;
      return {
        hashtagId: hashtagNode?.hashtagId,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
      };
    });
  };
}

export const hashtagService = new HashtagService();
