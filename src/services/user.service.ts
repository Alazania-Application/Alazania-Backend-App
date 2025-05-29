import Neo4jService from "./neo4j.service";
import { IUser, UserResponseDto } from "@/dtos";

class UserService extends Neo4jService {
  getUserById = async (id: string): Promise<UserResponseDto> => {
    const result = await this.readFromDB(
      `
      MATCH (u:User {id: $id})
      RETURN u 
      `,
      { id }
    );
    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;
    const user = doc;

    return user;
  };
}

export const userService = new UserService();
