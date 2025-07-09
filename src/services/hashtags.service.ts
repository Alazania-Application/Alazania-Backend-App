import { CreateHashtagInput, Hashtag } from "@/models";
import BaseService from "./base.service";
import slugify from "slugify";
import { topics } from "@/data";
import { NodeLabels, RelationshipTypes } from "@/enums";
import { IReadQueryParams, toNativeTypes } from "@/utils";

class HashtagService extends BaseService {
  seedHashtagsAndTopics = async () => {
    const now = new Date();
    const existingHashtags = await this.readFromDB(`
      MATCH(h:${NodeLabels.Hashtag})
      RETURN h.slug
    `);

    if (existingHashtags?.records?.length) {
      console.log("Hashtags and Topics already seeded to the DB");
      return;
    }

    const topicsAndHashtags = topics.map((topic) => {
      const topicName = String(topic.name).trim();
      const hashtags = topic.hashtags.map((hashtag) => ({
        name: hashtag.startsWith("#") ? hashtag.slice(1) : hashtag,
        slug: slugify(hashtag, {
          trim: true,
          lower: true,
          remove: /#/gi,
        }),
      }));
      return {
        name: topicName,
        slug: slugify(topic.name, {
          trim: true,
          lower: true,
        }),
        description: topic.description,
        hashtags,
      };
    });

    const query = `
      UNWIND $topics as topic
      MERGE (t:${NodeLabels.Topic} {slug: topic.slug})
      ON CREATE SET
        t.slug = topic.slug,
        t.name = topic.name,
        t.description = topic.description,
        t.popularity = 0,
        t.createdAt = datetime($createdAt)
      ON MATCH SET
        t.name = topic.name,
        t.description = topic.description
      WITH t, topic
      UNWIND topic.hashtags as hashtag
      MERGE (h:${NodeLabels.Hashtag} {slug: hashtag.slug})
        ON CREATE SET
          h.slug = hashtag.slug,
          h.popularity = 0,
          h.name = hashtag.name,
          h.createdAt = datetime($createdAt),
          h.lastUsedAt = datetime($createdAt)
        ON MATCH SET 
          h.name = hashtag.name

      MERGE (t)-[r:${RelationshipTypes.CONTAINS}]->(h)
        ON CREATE SET
          r.relevance = $defaultRelevance // Use a parameter for default relevance, or derive from input
        ON MATCH SET
          r.relevance = $defaultRelevance // You might want a different strategy here for existing relations

      RETURN t, h
    `;

    await this.writeToDB(query, {
      topics: topicsAndHashtags,
      defaultRelevance: 5,
      createdAt: now.toISOString(),
    });

    console.log("Topics and Hashtags have been seeded to the DB");
  };

  createHashtag = async (inputs: CreateHashtagInput[]): Promise<any> => {
    const allHashtagPromises: Promise<any>[] = [];
    const now = new Date();

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
            hashtag.createdAt = datetime($createdAt)
            hashtag.lastUsedAt = datetime($createdAt)
          ON MATCH SET 
            hashtag.name = $hashtagName
        `,
        {
          hashtagSlug,
          hashtagName,
          createdAt: now.toISOString(),
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

  getHashtagsByTopic = async (
    params?: Record<string, any>
  ): Promise<Partial<Hashtag[]>> => {
    let cypherQuery: string;
    let queryParams: Record<string, any> = {};

    if (params?.topicSlugs?.length) {
      cypherQuery = `
        UNWIND $topicSlugs AS topicSlug
        MATCH (t:${NodeLabels.Topic} {slug: topicSlug})-[:${RelationshipTypes.CONTAINS}]->(h:${NodeLabels.Hashtag})
        RETURN h
        ORDER BY h.popularity DESC
        LIMIT $limit
      `;
      queryParams.topicSlugs = params.topicSlugs;
    } else if (params?.userId) {
      cypherQuery = `
          MATCH (u:${NodeLabels.User} {id: $userId})
          -[:${RelationshipTypes.INTERESTED_IN}]
          ->(t:${NodeLabels.Topic})
          -[:${RelationshipTypes.CONTAINS}]
          ->(h:${NodeLabels.Hashtag})
          RETURN h
          ORDER BY h.popularity DESC
          LIMIT $limit
        `;
      queryParams.userId = params.userId;
    } else {
      cypherQuery = `
        MATCH (h:${NodeLabels.Hashtag})
        RETURN h
        ORDER BY h.popularity DESC
        LIMIT $limit
      `;
    }

    const result = await this.readFromDB(cypherQuery, { ...params });

    return result.records.map((record) => {
      const hashtagNode = record.get("h")?.properties as Hashtag;

      return {
        slug: hashtagNode?.slug,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
      };
    });
  };

  getUserFollowedHashtags = async (
    userId: string
  ): Promise<Partial<Hashtag>[]> => {
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
      return toNativeTypes({
        slug: hashtagNode?.slug,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
      });
    });
  };

  getAllHashtags = async (
    params: IReadQueryParams & { userId?: string } = {}
  ): Promise<Hashtag[]> => {
    const result = await this.readFromDB(
      `
        MATCH (h:${NodeLabels.Hashtag})
        OPTIONAL MATCH (h)<-[:${RelationshipTypes.HAS_HASHTAG}]-(p:${NodeLabels.Post} {isDeleted: false})

        WITH h, count(p) AS usageCount, COALESCE($search, null) AS search
        WHERE search IS NULL OR trim(search) = "" OR h.slug STARTS WITH toLower(trim(search))

        OPTIONAL MATCH (u:${NodeLabels.User} {id: $userId})-[following:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h)
        RETURN h AS hashtag, usageCount, following
        ORDER BY usageCount DESC
        SKIP $skip
        LIMIT $limit
      `,
      params
    );

    return result.records.map((record) => {
      const hashtagNode = record.get("hashtag")?.properties as Hashtag;
      const following = Boolean(!!record?.get("following")) ;
      return toNativeTypes({
        slug: hashtagNode?.slug,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
        following,
      }) as Hashtag;
    });
  };

  getTrendingHashtags = async (
    params: IReadQueryParams & { userId?: string } = { userId: "" }
  ): Promise<Hashtag[]> => {
    const result = await this.readFromDB(
      `
        MATCH (h:${NodeLabels.Hashtag})
        WHERE h.lastUsedAt >= datetime() - duration('P7D')
        OPTIONAL MATCH (h)<-[:${RelationshipTypes.HAS_HASHTAG}]-(p:${NodeLabels.Post} {isDeleted: false})

        WITH h, count(p) AS usageCount, COALESCE($search, null) AS search

        WHERE search IS NULL OR trim(search) = "" OR h.slug STARTS WITH toLower(trim(search))

        OPTIONAL MATCH (u:${NodeLabels.User} {id: $userId})-[following:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h)

        RETURN h AS hashtag, following
        ORDER BY usageCount DESC
        SKIP $skip
        LIMIT $limit
      `,
      params
    );

    return result.records.map((record) => {
      const hashtagNode = record.get("hashtag")?.properties as Hashtag;
      const following = Boolean(!!record?.get("following")) ;
      return toNativeTypes({
        slug: hashtagNode?.slug,
        name: hashtagNode?.name,
        popularity: hashtagNode?.popularity,
        following,
      }) as Hashtag;
    });
  };

  followHashtags = async (
    userId: string,
    hashtagSlugs: string[],
    interestLevel = 5
  ): Promise<void> => {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        UNWIND $hashtagSlugs AS hashtagSlug
        MATCH (h:${NodeLabels.Hashtag} {slug: hashtagSlug})
        MERGE (u)-[r:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h)
        ON CREATE SET 
          r.interestLevel = $interestLevel,
          r.since = datetime()
        ON MATCH SET 
          r.interestLevel = $interestLevel
        WITH u, h, r

        // Only increment popularity if this is a new follow

        WHERE NOT EXISTS {
          MATCH (u)-[:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h)
          WHERE r IS NOT NULL
        }
        SET h.popularity = coalesce(h.popularity, 0) + 1
      `,
      {
        userId,
        hashtagSlugs,
        interestLevel,
        since: new Date().toISOString(),
      }
    );
  };

  unfollowHashtags = async (
    userId: string,
    hashtagSlugs: string[] = []
  ): Promise<void> => {
    await this.writeToDB(
      `
        UNWIND $hashtagSlugs AS hashtagSlug
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.FOLLOWS_HASHTAG}]->(h:${NodeLabels.Hashtag} {slug: hashtagSlug})
        DELETE r
        SET h.popularity = CASE WHEN h.popularity > 0 THEN h.popularity - 1 ELSE 0 END
        RETURN h, hashtagSlug
      `,
      { userId, hashtagSlugs }
    );
  };
}

export const hashtagService = new HashtagService();
