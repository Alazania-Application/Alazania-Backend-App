import neo4j, {
  ManagedTransaction,
  QueryResult,
  RecordShape,
  type Driver,
  type Session,
} from "neo4j-driver";
import { db_password, db_uri, db_username } from "@/config";
import { IReadQueryParams } from "@/utils";

interface BaseQueryParams {
  sortOrder?: "ASC" | "DESC";
  page?: number;
  pageSize?: number;
}

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
    const finalParams = {
      sort: "DESC",
      page: 1,
      limit: 10,
      skip: 0,
      ...params,
    };

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

    finalParams.limit = neo4j.int(finalParams.limit||10)
    finalParams.skip = neo4j.int(finalParams.skip||0)

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
    try {
      // Create constraints
      await session.executeWrite(async (tx: ManagedTransaction) => {
        const constraintPromises = [
          // USER constraints
          tx.run(
            "CREATE CONSTRAINT user_email IF NOT EXISTS FOR (user:User) REQUIRE user.email IS UNIQUE"
          ),
          tx.run(
            "CREATE CONSTRAINT user_phone IF NOT EXISTS FOR (user:User) REQUIRE user.phone IS UNIQUE"
          ),
          tx.run(
            "CREATE CONSTRAINT user_username IF NOT EXISTS FOR (u:User) REQUIRE u.username IS UNIQUE"
          ),
          tx.run(
            "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE"
          ),
          // Post constraints
          tx.run(
            "CREATE CONSTRAINT post_id IF NOT EXISTS FOR (post:Post) REQUIRE post.id IS UNIQUE"
          ),
          tx.run(
            "CREATE CONSTRAINT message_id IF NOT EXISTS FOR (m:Message) REQUIRE m.id IS UNIQUE"
          ),

          // Topic constraints
          tx.run(
            "CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (topic:Topic) REQUIRE topic.slug IS UNIQUE"
          ),
          // Add other constraint creation promises here
        ];

        await Promise.all(constraintPromises);
      });
      console.log("Database initialized with constraints");
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    } finally {
      await session.close();
    }
  }
}
