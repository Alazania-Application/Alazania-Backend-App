import { NodeLabels, RelationshipTypes } from "@/enums";
import BaseService from "./base.service";
import { CreateTopicInput, Topic } from "@/models";
import { IReadQueryParams, toNativeTypes } from "@/utils";
import slugify from "slugify";

class TopicService extends BaseService {
  createTopic = async (
    input: CreateTopicInput = {
      description: "",
      name: "",
    }
  ): Promise<Topic> => {
    const slug = slugify(input.name, {
      trim: true,
      lower: true,
    });
    const now = new Date();

    const result = await this.writeToDB(
      `
        MERGE (topic:${NodeLabels.Topic} {slug: $slug})
        ON CREATE SET
            topic.name = $name,
            topic.description = $description,
            topic.popularity = 0,
            topic.createdAt = datetime($createdAt)
        ON MATCH SET
            topic.name = $name,
            topic.description = $description
        RETURN topic
        `,
      {
        slug,
        name: String(input.name).trim(),
        description: input.description,
        createdAt: now.toISOString(),
      }
    );

    const topicNode = result.records[0].get("topic")?.properties as Topic;
    return toNativeTypes({
      name: topicNode?.name,
      slug: topicNode?.slug,
      description: topicNode?.description,
      // popularity: (topicNode?.popularity as any)?.toInt(),
    }) as Topic;
  };

  getAllTopics = async (params: IReadQueryParams = {}): Promise<{data:Topic[], pagination: any}> => {
    const { result, pagination } = await this.readFromDB(
      `
        MATCH (t:${NodeLabels.Topic})
        WITH t, COUNT(t) AS totalCount
        // NOTE compare popularity either between follows or posts
        OPTIONAL MATCH (t)<-[:${RelationshipTypes.BELONGS_TO}]-(p:${NodeLabels.Post} {isDeleted: false})

        WITH t, totalCount, COUNT(p) AS usageCount, COALESCE($search, null) AS search

        WHERE search IS NULL OR trim(search) = "" OR t.slug STARTS WITH toLower(trim(search))
        RETURN t, totalCount
        ORDER BY usageCount DESC
        SKIP $skip
        LIMIT $limit
      `,
      params,
      true
    );

    const data = result.records.map((record) => {
      const topicNode = record.get("t")?.properties as Topic;
      return toNativeTypes({
        name: topicNode?.name,
        slug: topicNode?.slug,
        description: topicNode?.description,
        // popularity: (topicNode?.popularity as any)?.toInt(),
      }) as Topic;
    });

    return {
      data,
      pagination,
    };
  };

  addUserInterests = async (
    userId: string = "",
    topicSlugs: string[] = [],
    interestLevel = 5
  ): Promise<void> => {
    await this.writeToDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})
        UNWIND $topicSlugs AS topicSlug
        MATCH (t:${NodeLabels.Topic} {slug: topicSlug})
        MERGE (u)-[r:${RelationshipTypes.INTERESTED_IN}]->(t)
        ON CREATE SET 
          r.interestLevel = $interestLevel,
          r.since = datetime()
        ON MATCH SET 
          r.interestLevel = $interestLevel
        WITH u, t, r

        // Only increment popularity if this is a new follow

        WHERE NOT EXISTS {
          MATCH (u)-[:${RelationshipTypes.INTERESTED_IN}]->(t)
          WHERE r IS NOT NULL
        }
        SET t.popularity = coalesce(t.popularity, 0) + 1
      `,
      {
        userId,
        topicSlugs,
        interestLevel,
        since: new Date().toISOString(),
      }
    );
  };

  removeUserInterests = async (
    userId: string = "",
    topicSlugs: string[] = []
  ): Promise<void> => {
    await this.writeToDB(
      `
        UNWIND $topicSlugs AS topicSlug
        MATCH (u:${NodeLabels.User} {id: $userId})-[r:${RelationshipTypes.INTERESTED_IN}]->(t:${NodeLabels.Topic} {slug: topicSlug})
        DELETE r
        SET t.popularity = CASE WHEN t.popularity > 0 THEN t.popularity - 1 ELSE 0 END
      `,
      { userId, topicSlugs }
    );
  };

  getUserTopics = async (
    userId: string = "",
    params: IReadQueryParams = {}
  ): Promise<Topic[]> => {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User} {id: $userId})-[:${RelationshipTypes.INTERESTED_IN}]->(t:${NodeLabels.Topic})
        OPTIONAL MATCH (t)<-[:${RelationshipTypes.BELONGS_TO}]-(p:${NodeLabels.Post} {isDeleted: false})

        WITH t, count(p) AS usageCount, COALESCE($search, null) AS search

        WHERE search IS NULL OR trim(search) = "" OR t.slug STARTS WITH toLower(trim(search))
        RETURN t
        ORDER BY usageCount ${params?.sort}
        SKIP toInteger($skip)
        LIMIT toInteger($limit)
      `,
      { userId, ...params }
    );

    return result.records.map((record) => {
      const topicNode = record.get("t")?.properties as Topic;
      return toNativeTypes({
        name: topicNode?.name,
        slug: topicNode?.slug,
        description: topicNode?.description,
        // popularity: (topicNode?.popularity as any)?.toInt(),
      }) as Topic;
    });
  };

  getUserUnselectedTopics = async (
    userId: string = "",
    params: IReadQueryParams = {}
  ): Promise<Topic[]> => {
    const result = await this.readFromDB(
      `
        MATCH (t:${NodeLabels.Topic})
        MATCH (u:${NodeLabels.User} {id: $userId})
        WHERE NOT (u)-[:${RelationshipTypes.INTERESTED_IN}]->(t)
        WITH t, COALESCE($search, null) AS search
        WHERE search IS NULL OR trim(search) = "" OR t.slug STARTS WITH toLower(trim(search))
        RETURN t
        ORDER BY t.popularity ${params?.sort}
        SKIP toInteger($skip)
        LIMIT toInteger($limit)
      `,
      { userId, ...params }
    );

    return result.records.map((record) => {
      const topicNode = record.get("t")?.properties as Topic;
      return toNativeTypes({
        name: topicNode?.name,
        slug: topicNode?.slug,
        description: topicNode?.description,
        // popularity: (topicNode?.popularity as any)?.toInt(),
      }) as Topic;
    });
  };
}

export const topicService = new TopicService();
