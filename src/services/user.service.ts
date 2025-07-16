import {
  IReadQueryParams,
  omitDTO,
  toDTO,
  toNativeTypes,
  valueToNativeType,
} from "@/utils";
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
        "isFollowing",
        "isFollowingBack",
        "blockedByUser",
        "blockedUser",
        "totalPosts",
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
        MATCH (user:${NodeLabels.User} {id: $id})
        RETURN user
      `,
      { id }
    );
    const doc = result.records?.[0].get("user").properties as IUser;

    const user = this.withDTO(doc) as IUser;

    return user ?? null;
  };

  getUserProfile = async ({
    currentUser = "",
    userId = "",
  }: {
    currentUser: string;
    userId: string;
  }): Promise<UserResponseDto | null> => {
    let cypherQuery = "";
    if (currentUser == userId) {
      cypherQuery = `
        MATCH (currentUser:${NodeLabels.User} {id: $currentUser})
        OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(u) 

        WITH currentUser, COUNT(post) AS totalPosts

        RETURN currentUser AS user, totalPosts
      `;
    } else {
      cypherQuery = `
        MATCH (currentUser:${NodeLabels.User} {id: $currentUser})
        MATCH (otherUser:${NodeLabels.User} {id: $userId})
        OPTIONAL MATCH (otherUser)-[blockedByUser:${RelationshipTypes.BLOCKED}]->(currentUser)
        OPTIONAL MATCH (currentUser)-[blockedUser:${RelationshipTypes.BLOCKED}]->(otherUser)
        
        WHERE otherUser IS NOT NULL
        AND blockedByUser IS NULL 
        
        OPTIONAL MATCH (currentUser)-[followsUser:${RelationshipTypes.FOLLOWS}]->(otherUser)
        OPTIONAL MATCH (currentUser)<-[followedByUser:${RelationshipTypes.FOLLOWS}]-(otherUser)
        OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(otherUser) 

        RETURN COUNT(post) AS totalPosts, otherUser AS user, 
          followedByUser AS isFollowingBack,
          followsUser AS isFollowing,
          blockedByUser,
          blockedUser
      `;
    }

    let doc = null;
    try {
      const result = await this.readFromDB(cypherQuery, {
        currentUser,
        userId,
      });
      doc = toNativeTypes(result.records[0]?.toObject());
    } catch (error) {
      console.log("Error transforming data:::  ", error);
    }

    if (doc) {
      const totalPosts = valueToNativeType(doc?.totalPosts) ?? 0;

      const user = this.withPublicDTO(doc?.user) as IUser;

      user.isFollowingBack = Boolean(doc?.isFollowingBack);
      user.isFollowing = Boolean(doc?.isFollowing);
      user.totalPosts = totalPosts;

      return user;
    }

    return null;
  };

  getUserByQuery = async (query: string = ""): Promise<UserResponseDto> => {
    const result = await this.readFromDB(
      `
       MATCH (u:${NodeLabels.User})
       WHERE u.username = $query OR u.email = $query OR u.phone = $query OR u.id = $query
       RETURN u LIMIT 1
      `,
      { query }
    );
    const doc = result.records[0]?.get("u").properties as IUser;
    const user = this.withDTO(doc) as IUser;
    return user;
  };

  getUserByQueryWithCredentials = async (
    query: string = ""
  ): Promise<IUser> => {
    const result = await this.readFromDB(
      `
       MATCH (u:${NodeLabels.User})
       WHERE u.username = $query OR u.email = $query OR u.phone = $query OR u.id = $query
       RETURN u LIMIT 1
      `,
      { query }
    );
    return result.records[0].get("u").properties as IUser;
  };

  updateOnboardUser = async (id: string = "", payload: Partial<IUser> = {}) => {
    const updates = toDTO(payload, ["avatar", "username"]);

    const result = await this.writeToDB(
      `
      MERGE (u:${NodeLabels.User} {id: $id})
      SET u += $updates
      RETURN u
      `,
      { id, updates }
    );

    const doc = result.records?.[0]?.get("u").properties as IUser;

    return this.withDTO(doc);
  };

  updateUser = async (id: string = "", payload: Partial<IUser> = {}) => {
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
      MERGE (u:${NodeLabels.User} {id: $id})
      SET u += $updates
      RETURN u
      `,
      { id, updates }
    );

    const doc = result.records?.[0].get("u").properties as IUser;

    return this.withDTO(doc);
  };

  getUsers = async (
    params: IReadQueryParams & Record<string, any> = {
      userId: "",
      search: "",
    }
  ) => {
    const query = `
        MATCH (currentUser:${NodeLabels.User} {id: $userId})
        MATCH (other:${NodeLabels.User})
        OPTIONAL MATCH (currentUser)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(other)

        WITH other, currentUser, COALESCE($search, null) AS search

        WHERE other IS NOT NULL AND blockedByUser IS NULL
        AND (search IS NULL OR trim(search) = "" OR other.name CONTAINS toLower(trim(search)) OR other.username CONTAINS toLower(trim(search)))
        AND other.id <> $userId

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
    params: IReadQueryParams & Record<string, any> = { userId: "" }
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

        OPTIONAL MATCH (currentUser)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(other)

        WHERE other IS NOT NULL AND blockedByUser IS NULL 
        AND other.id <> $userId
        AND NOT EXISTS {
          MATCH (currentUser)-[:${RelationshipTypes.FOLLOWS}]->(other)
        }
        RETURN other
        LIMIT $limit
      `;

    const result = await this.readFromDB(query, params);

    return result.records.map((v) => ({
      ...this.withPublicDTO(v.get("other")?.properties),
    })) as IUser[];
  };

  reportUser = async (
    currentUserId: string = "",
    userToReport: string = "",
    reason: string = ""
  ) => {
    if (currentUserId == userToReport) {
      return;
    }

    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToReport: ${NodeLabels.User} {id: $userToReport})

      WHERE userToReport IS NOT NULL

      MERGE (currentUser)-[r:${RelationshipTypes.REPORTED_USER} {timestamp: datetime($timestamp)}]->(userToReport)
      ON CREATE SET
        r.reason = $reason
      
      RETURN userToReport
    `;

    await this.writeToDB(query, {
      currentUserId,
      userToReport,
      reason,
      timestamp: new Date().toISOString(),
    });
  };

  blockUser = async (
    currentUserId: string = "",
    userToBlockId: string = ""
  ) => {
    if (currentUserId == userToBlockId) {
      return;
    }

    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToBlock: ${NodeLabels.User} {id: $userToBlockId})

      OPTIONAL MATCH (userToBlock)<-[wasFollowingRel:${RelationshipTypes.FOLLOWS}]-(currentUser)
      OPTIONAL MATCH (userToBlock)-[wasFollowingBackRel:${RelationshipTypes.FOLLOWS}]->(currentUser)

      WHERE userToBlock IS NOT NULL

      MERGE (currentUser)-[r:${RelationshipTypes.BLOCKED}]->(userToBlock)
      ON CREATE SET
        r.timestamp = datetime($timestamp),
        r.wasFollowing = (wasFollowingRel IS NOT NULL),
        r.wasFollowingBack = (wasFollowingBackRel IS NOT NULL)
      
      // Use a WITH clause to carry over the booleans *before* deleting the relationships
      WITH currentUser, userToBlock, r,
           (wasFollowingRel IS NOT NULL) AS currentUserWasFollowing,
           (wasFollowingBackRel IS NOT NULL) AS userToBlockWasFollowingBack,
           wasFollowingRel, wasFollowingBackRel // Keep refs for deletion

      // Delete the FOLLOWS relationships if they existed
      DELETE wasFollowingRel, wasFollowingBackRel

      // Conditionally decrement counts based on the existence of the deleted relationships
      // If currentUser was following userToBlock:
      FOREACH (x IN CASE WHEN currentUserWasFollowing THEN [1] ELSE [] END |
          SET currentUser.following = coalesce(currentUser.following, 0) - 1
          SET userToBlock.followers = coalesce(userToBlock.followers, 0) - 1
      )

      // If userToBlock was following currentUser:
      FOREACH (x IN CASE WHEN userToBlockWasFollowingBack THEN [1] ELSE [] END |
          SET userToBlock.following = coalesce(userToBlock.following, 0) - 1
          SET currentUser.followers = coalesce(currentUser.followers, 0) - 1
      )

      RETURN r
    `;

    await this.writeToDB(query, {
      currentUserId,
      userToBlockId,
      timestamp: new Date().toISOString(),
    });
  };

  unBlockUser = async (
    currentUserId: string = "",
    userToUnBlockId: string = ""
  ) => {
    if (currentUserId == userToUnBlockId) {
      return;
    }
    const query = `
      MATCH (currentUser:${NodeLabels.User} {id: $currentUserId})
      MATCH (userToUnblock:${NodeLabels.User} {id: $userToUnBlockId})
      MATCH (currentUser)-[blockedRel:${RelationshipTypes.BLOCKED}]->(userToUnblock)

      WHERE userToUnblock IS NOT NULL

      WITH currentUser, userToUnblock,
           blockedRel.wasFollowing AS wasFollowing,
           blockedRel.wasFollowingBack AS wasFollowingBack,
           blockedRel

     
      DELETE blockedRel

      //  re-establish the FOLLOWS relationship from currentUser to userToUnblock
      //   We use FOREACH with a CASE statement to run the MERGE only if 'wasFollowing' was true.
      //   MERGE is used to create the relationship only if it doesn't already exist (idempotency).
      FOREACH (x IN CASE WHEN wasFollowing THEN [1] ELSE [] END |
          MERGE (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(userToUnblock)
          ON CREATE SET
            isFollowing.timestamp = datetime($timestamp), 
            userToUnblock.followers = coalesce(userToUnblock.followers, 0) + 1,
            currentUser.following = coalesce(currentUser.following, 0) + 1
      )

      // re-establish the FOLLOWS relationship from userToUnblock to currentUser
      FOREACH (x IN CASE WHEN wasFollowingBack THEN [1] ELSE [] END |
          MERGE (userToUnblock)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
          ON CREATE SET
            isFollowingBack.timestamp = datetime($timestamp), 
            currentUser.followers = coalesce(currentUser.followers, 0) + 1,
            userToUnblock.following = coalesce(userToUnblock.following, 0) + 1
      )
            
      RETURN currentUser, userToUnblock,
             (wasFollowing IS NOT NULL AND wasFollowing) AS restoredFollowing,
             (wasFollowingBack IS NOT NULL AND wasFollowingBack) AS restoredFollowingBack
    `;

    await this.writeToDB(query, {
      currentUserId,
      userToUnBlockId,
      timestamp: new Date().toISOString(),
    });
  };

  followUser = async (
    currentUserId: string = "",
    userToFollowId: string = ""
  ) => {
    if (currentUserId == userToFollowId) {
      return;
    }
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToFollow: ${NodeLabels.User} {id: $userToFollowId})
      OPTIONAL MATCH (userToFollow)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)

      WHERE userToFollow IS NOT NULL

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

  unfollowUser = async (
    currentUserId: string = "",
    userToUnfollowId: string = ""
  ) => {
    if (currentUserId == userToUnfollowId) {
      return;
    }
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})
      MATCH (userToUnfollow: ${NodeLabels.User} {id: $userToUnfollowId})
      OPTIONAL MATCH (userToUnfollow)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)

      WHERE userToUnfollow IS NOT NULL
      
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

  getUserFollowing = async (
    params: IReadQueryParams & {
      loggedInUser: string;
      userToMatchId: string;
    } = { loggedInUser: "", userToMatchId: "" }
  ) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $loggedInUser})
      MATCH (userToMatch: ${NodeLabels.User} {id: $userToMatchId})
      
      OPTIONAL MATCH (currentUser)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(userToMatch)
      WHERE userToMatch IS NOT NULL AND blockedByUser IS NULL 

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (currentUser)<-[isFollowingBack:${RelationshipTypes.FOLLOWS}]-(user)
      OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(user) 

      WITH user, userToMatch, isFollowing, isFollowingBack, COUNT(post) AS totalPosts
      
      RETURN COALESCE(userToMatch.following, 0) AS totalCount, user{.*,
        isFollowingBack: (isFollowingBack IS NOT NUll), 
        isFollowing: (isFollowing IS NOT NUll),
        totalPosts
      } AS user

      SKIP $skip
      LIMIT $limit
    `;

    const { result, pagination } = await this.readFromDB(query, params, true);

    const users = result.records.map((v) => {
      return this.withPublicDTO(v.get("user")) as IUser;
    }) as IUser[];

    return { users, pagination };
  };

  getUserFollowers = async (
    params: IReadQueryParams & {
      loggedInUser: string;
      userToMatchId: string;
    } = { loggedInUser: "", userToMatchId: "" }
  ) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $loggedInUser})
      MATCH (userToMatch: ${NodeLabels.User} {id: $userToMatchId})

      OPTIONAL MATCH (currentUser)<-[blockedByUser:${RelationshipTypes.BLOCKED}]-(userToMatch)
      WHERE userToMatch IS NOT NULL AND blockedByUser IS NULL
      

      MATCH (userToMatch)<-[:${RelationshipTypes.FOLLOWS}]-(user: ${NodeLabels.User})

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (user)-[isFollowingBack:${RelationshipTypes.FOLLOWS}]->(currentUser)
      OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(user) 

      WITH user,userToMatch, isFollowing, isFollowingBack, COUNT(post) AS totalPosts
      
      RETURN COALESCE(userToMatch.followers, 0) AS totalCount, user{.*,
        isFollowingBack: (isFollowingBack IS NOT NUll), 
        isFollowing: (isFollowing IS NOT NUll),
        totalPosts
      } AS user
      
      SKIP $skip
      LIMIT $limit
    `;

    const { result, pagination } = await this.readFromDB(query, params, true);

    const users = result.records.map((v) => {
      return this.withPublicDTO(v.get("user")) as IUser;
    }) as IUser[];

    return { users, pagination };
  };

  getMyFollowing = async (
    params: IReadQueryParams & { currentUserId: string } = { currentUserId: "" }
  ) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})

      MATCH (currentUser)-[:${RelationshipTypes.FOLLOWS}]->(user: ${NodeLabels.User})

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (currentUser)<-[isFollowingBack:${RelationshipTypes.FOLLOWS}]-(user)
      OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(user) 

      WITH user, currentUser, isFollowing, isFollowingBack, COUNT(post) AS totalPosts
      
      RETURN user{ .*,
        isFollowingBack: (isFollowingBack IS NOT NUll), 
        isFollowing: (isFollowing IS NOT NUll),
        totalPosts
      } AS user, COALESCE(currentUser.following, 0) AS totalCount

      SKIP $skip
      LIMIT $limit
    `;

    const { result, pagination } = await this.readFromDB(query, params, true);

    const users = result.records.map((v) => {
      return this.withPublicDTO(v.get("user")) as IUser;
    }) as IUser[];

    return { users, pagination };
  };

  getMyFollowers = async (
    params: IReadQueryParams & { currentUserId: string } = { currentUserId: "" }
  ) => {
    const query = `
      MATCH (currentUser: ${NodeLabels.User} {id: $currentUserId})

      MATCH (currentUser)<-[:${RelationshipTypes.FOLLOWS}]-(user: ${NodeLabels.User})

      OPTIONAL MATCH (currentUser)-[isFollowing:${RelationshipTypes.FOLLOWS}]->(user)
      OPTIONAL MATCH (currentUser)<-[isFollowingBack:${RelationshipTypes.FOLLOWS}]-(user)
      OPTIONAL MATCH (post:${NodeLabels.Post} {isDeleted:false})<-[:${RelationshipTypes.POSTED}]-(user) 

      WITH user, currentUser, isFollowing, isFollowingBack, COUNT(post) AS totalPosts
      
      RETURN user{ .*,
        isFollowingBack: (isFollowingBack IS NOT NUll), 
        isFollowing: (isFollowing IS NOT NUll),
        totalPosts
      } AS user, COALESCE(currentUser.followers, 0) AS totalCount

      SKIP $skip
      LIMIT $limit
    `;

    const { result, pagination } = await this.readFromDB(query, params, true);

    const users = result.records.map((v) => {
      return this.withPublicDTO(v.get("user")) as IUser;
    }) as IUser[];

    return { users, pagination };
  };
}

export const userService = new UserService();
