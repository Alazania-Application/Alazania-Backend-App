import { IReadQueryParams, omitDTO, toDTO } from "@/utils";
import BaseService from "./base.service";
import { IUser, UserResponseDto } from "@/models";
import { NodeLabels, RelationshipTypes } from "@/enums";

class UserService extends BaseService {
  withDTO = (doc: IUser, otherFields: string[] = []) => {
    try {
      return omitDTO(doc, ["password", "isDeleted", ...(otherFields as any)]);
    } catch (error) {
      return null;
    }
  };

  withPickDTO = (doc: IUser, otherFields: string[] = []) => {
    try {
      return toDTO(doc, [...(otherFields as any)]);
    } catch (error) {
      return null;
    }
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
    const user = this.withDTO(doc) as IUser;

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
    const user = this.withDTO(doc) as IUser;
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

  updateOnboardUser = async (id: string, payload: Partial<IUser>) => {
    const updates = toDTO(payload, ["avatar", "username"]);

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

  updateUser = async (id: string, payload: Partial<IUser>) => {
    const updates = toDTO(payload, [
      "avatar",
      "firstName",
      "lastName",
      "username",
      "lastLogin",
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

  getSuggestedUsers = async (
    params: IReadQueryParams & Record<string, any> = {}
  ) => {
    //   const query = `
    //   // Match users with shared interests
    //   MATCH (u:${NodeLabels.User} {id: $userId})
    //   OPTIONAL MATCH (u)-[myInterest:${RelationshipTypes.INTERESTED_IN}]->(topic:${NodeLabels.Topic})<-[theirInterest:${RelationshipTypes.INTERESTED_IN}]-(other:${NodeLabels.User})
    //   WHERE u.id <> other.id AND NOT (u)-[:${RelationshipTypes.FOLLOWS}]->(other)

    //   WITH u, other,
    //        SUM(COALESCE(myInterest.interestLevel * theirInterest.interestLevel, 0)) AS compatibilityScore

    //   // Now collect both users with shared and no shared topics (those will have score 0)
    //   WHERE other IS NOT NULL
    //   RETURN DISTINCT other, compatibilityScore
    //   ORDER BY compatibilityScore DESC
    //   LIMIT $limit
    // `;

    const query = `
        MATCH (currentUser:${NodeLabels.User} {userId: $userId})
        MATCH (other:${NodeLabels.User})
        WHERE other.userId <> $userId
          AND NOT EXISTS {
            MATCH (currentUser)-[:${RelationshipTypes.FOLLOWS}]->(other)
          }
        RETURN other
        LIMIT $limit
      `;

    // const query = `
    //   MATCH (currentUser:${NodeLabels.User} {id: $userId})
    //   MATCH (other:${NodeLabels.User})
    //   WHERE other.id <> $userId AND NOT (currentUser)-[:${RelationshipTypes.FOLLOWS}]->(other)
    //   RETURN other
    //   LIMIT $limit
    // `;

    const result = await this.readFromDB(query, params);
    console.log({ result: result.records });
    return result.records.map((v) =>
      this.withPickDTO(v.get("other").properties, [
        "firstName",
        "lastName",
        "id",
        "email",
        "username",
      ])
    ) as IUser[];
  };
}

export const userService = new UserService();
