import { IReadQueryParams, omitDTO, toDTO, valueToNativeType } from "@/utils";
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

  withPublicDTO = (doc: IUser, extraFields: string[] = []) => {
    try {
      return this.withPickDTO(doc, [
        "firstName",
        "lastName",
        "avatar",
        "id",
        "email",
        "username",
        "lastLogin",
        "following",
        "followers",
        "bio",
        ...extraFields,
      ]);
    } catch (error) {
      return null;
    }
  };

  getUserById = async (id: string): Promise<UserResponseDto | null> => {
    const result = await this.readFromDB(
      `
      MATCH (u:User {id: $id})
      OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(u) 
      RETURN u, COUNT(post) AS totalPosts
      `,
      { id }
    );
    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;
    const totalPosts =
      valueToNativeType(result?.records[0]?.get("totalPosts")) ?? 0;

    const user = this.withDTO(doc) as IUser;

    return user
      ? {
          ...(user ?? {}),
          totalPosts,
        }
      : null;
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
      "bio",
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

  getUsers = async (params: IReadQueryParams & Record<string, any> = {}) => {
    const query = `
        MATCH (currentUser:${NodeLabels.User} {id: $userId})
        MATCH (other:${NodeLabels.User})
        WHERE other.id <> $userId
        AND other IS NOT NULL
        AND (other.isDemo IS NULL OR other.isDemo <> true)
          // AND NOT EXISTS {
          //   MATCH (currentUser)-[:${RelationshipTypes.FOLLOWS}]->(other)
          // }
        OPTIONAL MATCH (other)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
        OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(other)
   
        RETURN other, isFollowing, isFollowingBack
        LIMIT $limit
      `;

    const result = await this.readFromDB(query, params);

    const users = result.records.map((v) => ({
      ...this.withPublicDTO(v.get("other").properties),
      isFollowingBack: Boolean(v.get("isFollowingBack")?.properties),
      isFollowing: Boolean(v.get("isFollowing")?.properties),
    })) as IUser[];

    return users;
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
        MATCH (currentUser:${NodeLabels.User} {id: $userId})
        MATCH (other:${NodeLabels.User})
        WHERE other.id <> $userId
        AND other IS NOT NULL
        AND (other.isDemo IS NULL OR other.isDemo <> true)
          AND NOT EXISTS {
            MATCH (currentUser)-[:${RelationshipTypes.FOLLOWS}]->(other)
          }
        RETURN other
        LIMIT $limit
      `;

    const result = await this.readFromDB(query, params);

    return result.records.map((v) => ({
      ...this.withPublicDTO(v.get("other")?.properties)
    })) as IUser[];
  };

  followUser = async (currentUserId: string, userToFollowId: string) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToFollow: ${NodeLabels.User} {id: $userToFollowId})
      OPTIONAL MATCH (userToFollow)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)

      MERGE (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(userToFollow)
        ON CREATE SET 
        isFollowing.timestamp = datetime($timestamp), 
        userToFollow.followers = coalesce(userToFollow.followers, 0) + 1,
        currentUser.following = coalesce(currentUser.following, 0) + 1

      RETURN userToFollow, isFollowingBack, isFollowing
    `;

    const result = await this.writeToDB(query, {
      currentUserId,
      userToFollowId,
      timestamp: new Date().toISOString(),
    });

    const doc = result.records.map((v) => ({
      ...this.withPublicDTO(v.get("userToFollow").properties),
      isFollowingBack: Boolean(v.get("isFollowingBack")?.properties),
      isFollowing: Boolean(v.get("isFollowing")?.properties),
    }))[0] as IUser;

    const user = this.withDTO(doc) as IUser;

    return user;
  };

  unfollowUser = async (currentUserId: string, userToUnfollowId: string) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToUnfollow: ${NodeLabels.User} {id: $userToUnfollowId})
      OPTIONAL MATCH (userToUnfollow)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
      
      MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(userToUnfollow)
      DELETE isFollowing
      SET userToUnfollow.followers = CASE WHEN userToUnfollow.followers > 0 THEN userToUnfollow.followers - 1 ELSE 0 END,
          currentUser.following = CASE WHEN currentUser.following > 0 THEN currentUser.following - 1 ELSE 0 END

      RETURN userToUnfollow, isFollowingBack, isFollowing
    `;

    const result = await this.writeToDB(query, {
      currentUserId,
      userToUnfollowId,
      timestamp: new Date().toISOString(),
    });

    const doc = result.records.map((v) => ({
      ...this.withPublicDTO(v.get("userToUnfollow").properties),
      isFollowingBack: Boolean(v.get("isFollowingBack")?.properties),
      isFollowing: Boolean(v.get("isFollowing")?.properties),
    }))[0] as IUser;

    const user = this.withDTO(doc) as IUser;

    return user;
  };

  getUserFollowing = async (currentUserId: string, userToMatchId: string) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToMatch: ${NodeLabels.User} {id: $userToMatchId})

      MATCH (user: ${NodeLabels.User})<-[:${RelationshipTypes.FOLLOWS}]-(userToMatch)
      WHERE user.id <> $userToMatchId
        AND (user.isDemo IS NULL OR user.isDemo <> true)

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (user)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
      
      RETURN user, isFollowingBack, isFollowing
      LIMIT $limit
    `;

    const result = await this.readFromDB(query, {
      currentUserId,
      userToMatchId,
      timestamp: new Date().toISOString(),
    });

    const users = result.records.map((v) => {
      const user = this.withPublicDTO({
        ...v.get("user").properties,
      }) as any;

      if (user?.id !== currentUserId) {
        user.isFollowing = Boolean(v.get("isFollowing")?.properties);
        user.isFollowingBack = Boolean(v.get("isFollowingBack")?.properties);
      }

      return user;
    }) as IUser[];

    return users;
  };

  getUserFollowers = async (currentUserId: string, userToMatchId: string) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToMatch: ${NodeLabels.User} {id: $userToMatchId})

      MATCH (user: ${NodeLabels.User})-[:${RelationshipTypes.FOLLOWS}]->(userToMatch)
      WHERE user.id <> $userToMatchId
        AND (user.isDemo IS NULL OR user.isDemo <> true)

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (user)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
      
      RETURN user, isFollowingBack, isFollowing
      LIMIT $limit
    `;

    const result = await this.readFromDB(query, {
      currentUserId,
      userToMatchId,
    });

    const users = result.records.map((v) => {
      const user = this.withPublicDTO({
        ...v.get("user").properties,
      }) as any;

      if (user?.id !== currentUserId) {
        user.isFollowing = Boolean(v.get("isFollowing")?.properties);
        user.isFollowingBack = Boolean(v.get("isFollowingBack")?.properties);
      }

      return user;
    }) as IUser[];

    return users;
  };

  getMyFollowing = async (currentUserId: string) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToMatch: ${NodeLabels.User})

      MATCH (user: ${NodeLabels.User})<-[:${RelationshipTypes.FOLLOWS}]-(userToMatch)
      WHERE user.id <> userToMatch.id
        AND (user.isDemo IS NULL OR user.isDemo <> true)

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (user)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
      
      RETURN user, isFollowingBack, isFollowing
      LIMIT $limit
    `;

    const result = await this.readFromDB(query, {
      currentUserId,
    });

    const users = result.records.map((v) => {
      const user = this.withPublicDTO({
        ...v.get("user").properties,
      }) as any;

      if (user?.id !== currentUserId) {
        user.isFollowing = Boolean(v.get("isFollowing")?.properties);
        user.isFollowingBack = Boolean(v.get("isFollowingBack")?.properties);
      }

      return user;
    }) as IUser[];

    return users;
  };

  getMyFollowers = async (currentUserId: string) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToMatch: ${NodeLabels.User})

      MATCH (user: ${NodeLabels.User})-[:${RelationshipTypes.FOLLOWS}]->(userToMatch)
      WHERE user.id <> userToMatch.id
        AND (user.isDemo IS NULL OR user.isDemo <> true)

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (user)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
      
      RETURN user, isFollowingBack, isFollowing
      LIMIT $limit
    `;

    const result = await this.readFromDB(query, {
      currentUserId,
    });

    const users = result.records.map((v) => {
      const user = this.withPublicDTO(v.get("user")?.properties) as any;

      if (user?.id !== currentUserId) {
        user.isFollowing = Boolean(v.get("isFollowing")?.properties);
        user.isFollowingBack = Boolean(v.get("isFollowingBack")?.properties);
      }

      return user;
    }) as IUser[];

    return users;
  };
}

export const userService = new UserService();
