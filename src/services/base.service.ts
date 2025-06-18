import neo4j, {
  ManagedTransaction,
  QueryResult,
  RecordShape,
  Transaction,
  type Driver,
  type Session,
} from "neo4j-driver";
import { db_password, db_uri, db_username } from "@/config";
import { getPaginationFilters, IReadQueryParams } from "@/utils";
import { NodeLabels, RelationshipTypes } from "@/enums";

export default class BaseService {
  private driver: Driver;
  private static instance: BaseService;

  constructor() {
    console.log("Connecting to Neo4j database...");
    // Initialize the Neo4j driver with the database URI and credentials
    if (!db_uri || !db_username || !db_password) {
      throw new Error("Database connection details are not provided.");
    }
    this.driver = neo4j.driver(
      db_uri,
      neo4j.auth.basic(db_username, db_password)
    );
  }

  public static getInstance(): BaseService {
    if (!BaseService.instance) {
      BaseService.instance = new BaseService();
    }
    return BaseService.instance;
  }

  private getSession(): Session {
    return this.driver.session();
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }

  protected async readFromDB<T extends RecordShape>(
    cypher: string,
    params: IReadQueryParams & Record<string, any> = {
      sort: "DESC",
      page: 1,
      limit: 10,
      skip: 0,
    }
  ): Promise<QueryResult<T>> {
    const session = this.getSession();
    const finalParams = getPaginationFilters(params);

    if (
      finalParams.skip !== undefined &&
      typeof finalParams.skip !== "number"
    ) {
      finalParams.skip = parseInt(String(finalParams.skip), 0);
    } else if (finalParams.skip !== undefined) {
      finalParams.skip = Math.floor(finalParams.skip);
    }

    if (
      finalParams.limit !== undefined &&
      typeof finalParams.limit !== "number"
    ) {
      finalParams.limit = parseInt(String(finalParams.limit), 10);
    } else if (finalParams.limit !== undefined) {
      finalParams.limit = Math.floor(finalParams.limit);
    }

    finalParams.limit = neo4j.int(finalParams.limit || 10);
    finalParams.skip = neo4j.int(finalParams.skip || 0);

    return await session
      .executeRead((tx: ManagedTransaction) => tx.run<T>(cypher, finalParams))
      .finally(async () => {
        await session.close();
      });
  }

  protected async writeToDB<T extends RecordShape>(
    cypher: string,
    params: Record<string, any> = {}
  ): Promise<QueryResult<T>> {
    const session = this.getSession();
    return await session
      .executeWrite((tx: ManagedTransaction) => tx.run<T>(cypher, params))
      .finally(async () => {
        await session.close();
      });
  }

  public async initializeDatabase(): Promise<void> {
    const session = this.getSession();
    // Create constraints
    const constraints = [
      // === User Constraints ===
      ["user_email", "FOR (user:User) REQUIRE user.email IS UNIQUE"],
      ["user_phone", "FOR (user:User) REQUIRE user.phone IS UNIQUE"],
      ["user_username", "FOR (u:User) REQUIRE u.username IS UNIQUE"],
      ["user_id", "FOR (u:User) REQUIRE u.id IS UNIQUE"],

      // === Post & Message Constraints ===
      ["post_id", "FOR (post:Post) REQUIRE post.id IS UNIQUE"],
      ["message_id", "FOR (m:Message) REQUIRE m.id IS UNIQUE"],

      // === Topic Constraint ===
      ["topic_name", "FOR (topic:Topic) REQUIRE topic.slug IS UNIQUE"],
    ];

    const indexes = [
      ["user_id_index", "FOR (u:User) ON (u.id)"],
      ["user_id_index", "FOR (u:User) ON (u.id)"],
      ["post_createdAt_index", "FOR (p:Post) ON (p.createdAt)"],
      ["hashtag_slug_index", "FOR (h:Hashtag) ON (h.slug)"],
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

        await Promise.all([...contraintPromises, ...indexPromises, userSearch]);
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
      MERGE (a:User {id: "_seedA", isDemo: true})
      MERGE (b:User {id: "_seedB", isDemo: true})
      MERGE (a)-[:${RelationshipTypes.FOLLOWS} {isDemo: true}]->(b)
    `);

    // Create one relationship of each type between the dummy nodes
    const relationshipPromises = Object.values(RelationshipTypes).map(
      (relType) =>
        tx.run(`
        MATCH (a:${NodeLabels.User} {id: "_seedA"}), (b:${NodeLabels.User} {id: "_seedB"})
        MERGE (a)-[:${relType} {isDemo: true}]->(b)
      `)
    );

    await Promise.all(relationshipPromises);
  };
}
