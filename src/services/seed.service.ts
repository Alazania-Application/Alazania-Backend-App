import { NodeLabels, RelationshipTypes } from "@/enums";
import BaseService from "./base.service";
import { ManagedTransaction } from "neo4j-driver";

class SeedService extends BaseService {
  async initializeDatabase(): Promise<void> {
    const session = this.getSession();
    // Create constraints
    const constraints = [
      // === User Constraints ===
      [
        "user_email",
        `FOR (user:${NodeLabels.User}) REQUIRE user.email IS UNIQUE`,
      ],
      [
        "user_phone",
        `FOR (user:${NodeLabels.User}) REQUIRE user.phone IS UNIQUE`,
      ],
      [
        "user_username",
        `FOR (user:${NodeLabels.User}) REQUIRE user.username IS UNIQUE`,
      ],
      ["user_id", `FOR (user:${NodeLabels.User}) REQUIRE user.id IS UNIQUE`],

      // === Post & Message Constraints ===
      ["post_id", `FOR (post:${NodeLabels.Post}) REQUIRE post.id IS UNIQUE`],
      [
        "comment_id",
        `FOR (comment:${NodeLabels.Comment}) REQUIRE comment.id IS UNIQUE`,
      ],

      // === PostSession Constraints ===
      [
        "post_session_id",
        `FOR (s:${NodeLabels.PostSession}) REQUIRE s.id IS UNIQUE`,
      ], // sessionId must be unique

      // === NEW: File Constraints ===
      ["file_id", `FOR (f:${NodeLabels.File}) REQUIRE f.id IS UNIQUE`], // fileId must be unique
      ["file_s3Key", `FOR (f:${NodeLabels.File}) REQUIRE f.s3Key IS UNIQUE`], // s3Key should be unique if each file has one node

      // === Topic Constraint ===
      [
        "topic_name",
        `FOR (topic:${NodeLabels.Topic}) REQUIRE topic.slug IS UNIQUE`,
      ],
    ];

    const indexes = [
      ["user_id_index", `FOR (u:${NodeLabels.User}) ON (u.id)`],
      ["user_username_index", `FOR (u:${NodeLabels.User}) ON (u.username)`],
      ["post_createdAt_index", `FOR (p:${NodeLabels.Post}) ON (p.createdAt)`],
      ["post_id_index", `FOR (p:${NodeLabels.Post}) ON (p.id)`],
      ["post_isDeleted_index", `FOR (p:${NodeLabels.Post}) ON (p.isDeleted)`],
      ["comment_id_index", `FOR (c:${NodeLabels.Comment}) ON (c.id)`],
      ["comment_isDeleted_index", `FOR (c:${NodeLabels.Comment}) ON (c.isDeleted)`],
      ["comment_isRoot_index", `FOR (c:${NodeLabels.Comment}) ON (c.isRoot)`],
      ["hashtag_slug_index", `FOR (h:${NodeLabels.Hashtag}) ON (h.slug)`],
      ["topic_slug_index", `FOR (t:${NodeLabels.Topic}) ON (t.slug)`],

      // === NEW: PostSession Indexes ===
      ["post_session_id_index", `FOR (s:${NodeLabels.PostSession}) ON (s.id)`], // For efficient lookup
      ["ttl_index", `FOR (t:${NodeLabels.TTL}) ON (t.ttl)`], // For efficient lookup

      // === NEW: File Indexes ===
      ["file_id_index", `FOR (f:${NodeLabels.File}) ON (f.id)`],
      ["file_s3Key_index", `FOR (f:${NodeLabels.File}) ON (f.s3Key)`], // For efficient lookup by S3 key

      // === NEW: Activity Indexes ===
      ["activity_createdAt", `FOR (a:${NodeLabels.Activity}) ON (a.createdAt)`],
    ];

    await session
      .executeWrite(async (tx: ManagedTransaction) => {
        const contraintPromises = constraints.map(([name, definition]) =>
          tx.run(`CREATE CONSTRAINT ${name} IF NOT EXISTS ${definition}`)
        );
        const indexPromises = indexes.map(([name, definition]) =>
          tx.run(`CREATE INDEX ${name} IF NOT EXISTS ${definition}`)
        );
        const userSearch = tx.run(
          `CREATE FULLTEXT INDEX user_search_index IF NOT EXISTS FOR (u:${NodeLabels.User}) ON EACH [u.username, u.firstname, u.lastname, u.email]`
        );
        const hashtagSearch = tx.run(
          `CREATE FULLTEXT INDEX hashtag_search_index IF NOT EXISTS FOR (h:${NodeLabels.Hashtag}) ON EACH [h.slug, h.name]`
        );
        const topicSearch = tx.run(
          `CREATE FULLTEXT INDEX topic_search_index IF NOT EXISTS FOR (t:${NodeLabels.Topic}) ON EACH [t.slug, t.name]`
        );

        await Promise.all([...contraintPromises, ...indexPromises, userSearch, hashtagSearch, topicSearch]);
      })
      .then(async () => {
        console.log("Database initialized with constraints");

        await session.executeWrite(
          async (tx) => await this.seedRelationshipTypes(tx)
        );
      })
      .catch((error) => {
        console.error("Error initializing database:", error);
      })
      .finally(async () => {
        await session.close();
      });
  }

  private seedRelationshipTypes = async (tx: ManagedTransaction) => {
    // Ensure two dummy nodes exist
    await tx.run(`
          MERGE (a:${NodeLabels.DummyUser} {id: "_seedA", isDummy: true})
          MERGE (b:${NodeLabels.DummyUser} {id: "_seedB", isDummy: true})
          MERGE (a)-[:${RelationshipTypes.FOLLOWS} {isDummy: true}]-(b)
        `);

    // Create one relationship of each type between the dummy nodes
    const relationshipPromises = Object.values(RelationshipTypes).map(
      (relType) =>
        tx.run(`
            MATCH (a:${NodeLabels.DummyUser} {id: "_seedA"}), (b:${NodeLabels.DummyUser} {id: "_seedB"})
            MERGE (a)-[:${relType} {isDummy: true}]->(b)
          `)
    );

    await Promise.all(relationshipPromises);
  };
}


export const seedService = new SeedService()