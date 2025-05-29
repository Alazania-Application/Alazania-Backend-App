import { omitDTO, toDTO } from "@/utils";
import Neo4jService from "./neo4j.service";
import { IUser, UserResponseDto } from "@/dtos";

class UserService extends Neo4jService {
  private withDTO = (doc: IUser) => {
    return omitDTO(doc, ["password", "isDeleted"]);
  };

  getUserById = async (id: string): Promise<UserResponseDto> => {
    const result = await this.readFromDB(
      `
      MATCH (u:User {id: $id})
      RETURN u 
      `,
      { id }
    );
    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;
    const user = this.withDTO(doc);

    return user;
  };

  getUserByQuery = async (query: string): Promise<UserResponseDto> => {
    const result = await this.readFromDB(
      `
       MATCH (u:User)
       WHERE u.username = $query OR u.email = $query OR u.phone = $query OR u.id = $query
       RETURN u LIMIT 1
      `,
      { query }
    );
    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;
    const user = this.withDTO(doc);
    return user;
  };

  getUserByQueryWithCredentials = async (query: string): Promise<IUser> => {
    const result = await this.readFromDB(
      `
       MATCH (u:User)
       WHERE u.username = $query OR u.email = $query OR u.phone = $query OR u.id = $query
       RETURN u LIMIT 1
      `,
      { query }
    );
    return result.records.map((v) => v.get("u").properties)[0] as IUser;
  };

  updateUser = async (id: string, payload: Partial<IUser>) => {
    const updates = toDTO(payload, [
      "avatar",
      "firstName",
      "lastName",
      "username",
    ]);

    const result = await this.writeToDB(
      `
      MERGE (u:User {id: $id})
      SET u += $updates
      RETURN u
      `,
      { id, updates }
    );

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;

    return this.withDTO(doc);
  };
}

export const userService = new UserService();
