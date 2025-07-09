import neo4j, {
  ManagedTransaction,
  QueryResult,
  RecordShape,
  type Driver,
  type Session,
} from "neo4j-driver";
import { db_password, db_uri, db_username } from "@/config";
import { getPaginationFilters, IReadQueryParams, toNativeTypes } from "@/utils";

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

  protected getSession(): Session {
    return this.driver.session();
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }

  protected async readFromDB<T extends RecordShape>(
    cypher: string,
    params?: IReadQueryParams & Record<string, any>,
    paginated?: false
  ): Promise<QueryResult<T>>;

  protected async readFromDB<T extends RecordShape>(
    cypher: string,
    params: IReadQueryParams & Record<string, any>,
    paginated: true
  ): Promise<{
    result: QueryResult<T>;
    pagination: { page: number; limit: number; total: number };
  }>;

  protected async readFromDB<T extends RecordShape>(
    cypher: string,
    params: IReadQueryParams & Record<string, any> = {
      sort: "DESC",
      page: 1,
      limit: 10,
      skip: 0,
    },
    paginated: Boolean = false
  ): Promise<any> {
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

    const result = await session
      .executeRead((tx: ManagedTransaction) => tx.run<T>(cypher, finalParams))
      .finally(async () => {
        await session.close();
      });

    let totalCount = 0;
    if (paginated) {
      try {
        totalCount = result.records[0]?.get("totalCount") ?? 0;
      } catch (error) {
        console.error(error);
      }
    }

    // const totalCount = toNativeTypes(result.records[0]?.toObject() ?? {})

    return paginated
      ? {
          result,
          pagination: toNativeTypes({
            page: finalParams?.page,
            limit: finalParams?.limit,
            totalCount
          }),
        }
      : result;
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
}
