import neo4j, {
  ManagedTransaction,
  type Driver,
  type Session,
} from "neo4j-driver";
import { db_password, db_uri, db_username } from "@/config";

export default class Neo4jService {
  private driver: Driver;
  private static instance: Neo4jService;

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

  public static getInstance(): Neo4jService {
    if (!Neo4jService.instance) {
      Neo4jService.instance = new Neo4jService();
    }
    return Neo4jService.instance;
  }

  public getSession(): Session {
    return this.driver.session();
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }

  public async readFromDB(
    cypher: string,
    params: Record<string, string | number> = {}
  ) {
    const session = this.getSession();
    return await session
      .executeRead((tx: ManagedTransaction) => tx.run(cypher, params))
      .finally(async () => {
        await session.close();
      });
  }

  public async writeToDB(
    cypher: string,
    params: Record<string, string | number> = {}
  ) {
    const session = this.getSession();
    return await session
      .executeWrite((tx: ManagedTransaction) => tx.run(cypher, params))
      .finally(async () => {
        await session.close();
      });
  }

  public async initializeDatabase(): Promise<void> {
    const session = this.getSession();
    try {
      // Create constraints
      await session.run(
        "CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE"
      );
      await session.run(
        "CREATE CONSTRAINT user_username IF NOT EXISTS FOR (u:User) REQUIRE u.username IS UNIQUE"
      );
      await session.run(
        "CREATE CONSTRAINT post_id IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE"
      );
      await session.run(
        "CREATE CONSTRAINT message_id IF NOT EXISTS FOR (m:Message) REQUIRE m.id IS UNIQUE"
      );

      console.log("Database initialized with constraints");
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    } finally {
      await session.close();
    }
  }
}
